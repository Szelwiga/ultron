package com.doki.service;

import java.io.InputStream;
import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.RSAPublicKeySpec;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Validates Google OIDC ID tokens against Google JWKS endpoints.
 */
public class GoogleTokenVerifier {
  private static final String JWKS_URL =
      "https://www.googleapis.com/oauth2/v3/certs";
  private final String expectedClientId;
  private final HttpClient httpClient;
  private final Map<String, PublicKey> keyCache = new ConcurrentHashMap<>();
  private long lastCacheRefreshMs = 0;

  // Initializes token verifier with target audience Google client ID.
  public GoogleTokenVerifier(String expectedClientId) {
    this.expectedClientId = expectedClientId;
    this.httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .build();
  }

  // Token payload extracted upon successful signature verification.
  public static class VerifiedToken {
    public final String subject;
    public final String email;
    public final String name;

    public VerifiedToken(String subject, String email, String name) {
      this.subject = subject;
      this.email = email;
      this.name = name;
    }
  }

  // Verifies signature, expiry, issuer, and audience of Google ID token.
  public Optional<VerifiedToken> verify(String idToken) {
    if (idToken == null || idToken.isBlank()) {
      return Optional.empty();
    }
    String[] parts = idToken.split("\\.");
    if (parts.length != 3) {
      return Optional.empty();
    }

    try {
      String headerJson = new String(
          Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8);
      String payloadJson = new String(
          Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
      byte[] signatureBytes = Base64.getUrlDecoder().decode(parts[2]);

      Optional<String> kidOpt = extractString(headerJson, "kid");
      if (kidOpt.isEmpty()) {
        System.err.println(
            "GoogleTokenVerifier: missing kid in header: " + headerJson);
        return Optional.empty();
      }

      Optional<PublicKey> keyOpt = getPublicKey(kidOpt.get());
      if (keyOpt.isEmpty()) {
        refreshJwks();
        keyOpt = getPublicKey(kidOpt.get());
        if (keyOpt.isEmpty()) {
          System.err.println(
              "GoogleTokenVerifier: public key not found for: " +
              kidOpt.get());
          return Optional.empty();
        }
      }

      byte[] signedContent = (parts[0] + "." + parts[1])
          .getBytes(StandardCharsets.US_ASCII);
      Signature sig = Signature.getInstance("SHA256withRSA");
      sig.initVerify(keyOpt.get());
      sig.update(signedContent);
      if (!sig.verify(signatureBytes)) {
        System.err.println(
            "GoogleTokenVerifier: signature verification failed");
        return Optional.empty();
      }

      return validateClaims(payloadJson);
    } catch (Exception e) {
      System.err.println(
          "GoogleTokenVerifier: exception during verify: " + e.getMessage());
      e.printStackTrace();
      return Optional.empty();
    }
  }

  // Validates standard OIDC claims: exp, aud, and iss.
  private Optional<VerifiedToken> validateClaims(String payloadJson) {
    Optional<Long> expOpt = extractLong(payloadJson, "exp");
    long nowSec = System.currentTimeMillis() / 1000L;
    if (expOpt.isEmpty() || expOpt.get() < nowSec) {
      System.err.println(
          "GoogleTokenVerifier: token expired or missing exp: " + expOpt);
      return Optional.empty();
    }

    Optional<String> audOpt = extractString(payloadJson, "aud");
    if (audOpt.isEmpty() || !audOpt.get().equals(expectedClientId)) {
      System.err.println("GoogleTokenVerifier: aud mismatch. Expected [" +
          expectedClientId + "] but got [" + audOpt.orElse("none") + "]");
      return Optional.empty();
    }

    Optional<String> issOpt = extractString(payloadJson, "iss");
    if (issOpt.isEmpty() || (!"https://accounts.google.com".equals(issOpt.get())
        && !"accounts.google.com".equals(issOpt.get()))) {
      System.err.println(
          "GoogleTokenVerifier: iss mismatch: " + issOpt.orElse("none"));
      return Optional.empty();
    }

    Optional<String> subOpt = extractString(payloadJson, "sub");
    if (subOpt.isEmpty() || subOpt.get().isBlank()) {
      return Optional.empty();
    }

    String email = extractString(payloadJson, "email").orElse("");
    String name = extractString(payloadJson, "name").orElse("User");
    return Optional.of(new VerifiedToken(subOpt.get(), email, name));
  }

  // Gets public key by key ID kid from cache.
  private Optional<PublicKey> getPublicKey(String kid) {
    return Optional.ofNullable(keyCache.get(kid));
  }

  // Refreshes public keys from Google JWKS endpoint over HTTPS.
  private synchronized void refreshJwks() {
    long now = System.currentTimeMillis();
    if (now - lastCacheRefreshMs < 60_000) {
      return;
    }
    try {
      HttpRequest req = HttpRequest.newBuilder()
          .uri(URI.create(JWKS_URL))
          .timeout(Duration.ofSeconds(5))
          .GET()
          .build();
      HttpResponse<String> resp =
          httpClient.send(req, HttpResponse.BodyHandlers.ofString());
      if (resp.statusCode() == 200) {
        parseAndCacheJwks(resp.body());
        lastCacheRefreshMs = now;
      }
    } catch (Exception e) {
      System.err.println(
          "GoogleTokenVerifier: failed to fetch JWKS: " + e.getMessage());
      e.printStackTrace();
    }
  }

  // Parses JWKS keys array and creates RSAPublicKey instances.
  private void parseAndCacheJwks(String json) {
    int keysIdx = json.indexOf("\"keys\":");
    if (keysIdx < 0) return;
    int start = json.indexOf('[', keysIdx);
    int end = json.lastIndexOf(']');
    if (start < 0 || end <= start) return;

    int pos = start + 1;
    while ((pos = json.indexOf('{', pos)) != -1 && pos < end) {
      int objEnd = json.indexOf('}', pos);
      if (objEnd == -1) break;
      String keyObj = json.substring(pos, objEnd + 1);
      Optional<String> kid = extractString(keyObj, "kid");
      Optional<String> n = extractString(keyObj, "n");
      Optional<String> e = extractString(keyObj, "e");
      if (kid.isPresent() && n.isPresent() && e.isPresent()) {
        try {
          BigInteger modulus = new BigInteger(1,
              Base64.getUrlDecoder().decode(n.get()));
          BigInteger exponent = new BigInteger(1,
              Base64.getUrlDecoder().decode(e.get()));
          RSAPublicKeySpec spec = new RSAPublicKeySpec(modulus, exponent);
          PublicKey pub = KeyFactory.getInstance("RSA").generatePublic(spec);
          keyCache.put(kid.get(), pub);
        } catch (Exception ignored) {}
      }
      pos = objEnd + 1;
    }
  }

  // Extracts optional string field from JSON text.
  private static Optional<String> extractString(String json, String field) {
    String needle = "\"" + field + "\"";
    int idx = json.indexOf(needle);
    if (idx < 0) return Optional.empty();
    int colon = json.indexOf(':', idx + needle.length());
    if (colon < 0) return Optional.empty();
    int start = json.indexOf('"', colon + 1);
    if (start < 0) return Optional.empty();
    int end = json.indexOf('"', start + 1);
    if (end < 0) return Optional.empty();
    return Optional.of(json.substring(start + 1, end));
  }

  // Extracts optional numeric long field from JSON text.
  private static Optional<Long> extractLong(String json, String field) {
    String needle = "\"" + field + "\"";
    int idx = json.indexOf(needle);
    if (idx < 0) return Optional.empty();
    int colon = json.indexOf(':', idx + needle.length());
    if (colon < 0) return Optional.empty();
    int pos = colon + 1;
    while (pos < json.length() && Character.isWhitespace(json.charAt(pos))) {
      pos++;
    }
    int end = pos;
    while (end < json.length() && Character.isDigit(json.charAt(end))) {
      end++;
    }
    if (end > pos) {
      try {
        return Optional.of(Long.parseLong(json.substring(pos, end)));
      } catch (NumberFormatException ignored) {}
    }
    return Optional.empty();
  }
}
