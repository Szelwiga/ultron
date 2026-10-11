package com.doki.service;

import com.doki.dbs.SessionDb;
import com.doki.dbs.UserDb;
import com.doki.proto.auth.GoogleLoginRequest;
import com.doki.proto.auth.GoogleLoginResponse;
import com.doki.proto.auth.Session;
import com.doki.proto.auth.SetUsernameRequest;
import com.doki.proto.auth.SetUsernameResponse;
import com.doki.proto.auth.User;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Service orchestrating authentication logic and user identity.
 */
public class AuthService {
  private static final Pattern USERNAME_PATTERN =
      Pattern.compile("^[a-zA-Z]+$");
  private static final long SESSION_DURATION_MS =
      7L * 24 * 60 * 60 * 1000; // 7 days

  private final UserDb userDb;
  private final SessionDb sessionDb;
  private final SecureRandom secureRandom = new SecureRandom();

  // Initializes AuthService with databases.
  public AuthService(UserDb userDb, SessionDb sessionDb) {
    this.userDb = userDb;
    this.sessionDb = sessionDb;
  }

  // Result object holding API response and generated session token if any.
  public static class LoginResult {
    public final GoogleLoginResponse response;
    public final String sessionToken;

    public LoginResult(GoogleLoginResponse resp, String token) {
      this.response = resp;
      this.sessionToken = token;
    }
  }

  // Handles Google login request, provisioning user and session.
  public LoginResult handleGoogleLogin(GoogleLoginRequest req)
      throws IOException {
    String idToken = req.getIdToken();
    if (idToken == null || idToken.isBlank()) {
      return new LoginResult(GoogleLoginResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Missing ID token")
          .build(), null);
    }

    GoogleUserInfo info = parseGoogleIdToken(idToken);
    if (info == null || info.googleId.isBlank()) {
      return new LoginResult(GoogleLoginResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Invalid ID token")
          .build(), null);
    }

    Optional<User> existingUser = userDb.findByGoogleId(info.googleId);
    boolean needsPrompt;
    User user;

    if (existingUser.isPresent()) {
      user = existingUser.get();
      needsPrompt = false;
    } else {
      String tag = generateUniqueTag();
      String sanitizedName = sanitizeGoogleName(info.name);
      user = User.newBuilder()
          .setUsername(sanitizedName + "#" + tag)
          .setEmail(info.email)
          .setGoogleId(info.googleId)
          .build();
      userDb.saveUser(user);
      needsPrompt = true;
    }

    String sessionToken = generateSessionToken();
    String tag = UserDb.extractTag(user.getUsername());
    long expiresAt = System.currentTimeMillis() + SESSION_DURATION_MS;

    sessionDb.saveSession(Session.newBuilder()
        .setSessionToken(sessionToken)
        .setUserTag(tag)
        .setExpiresAtMs(expiresAt)
        .build());

    String displayName = UserDb.extractName(user.getUsername());
    GoogleLoginResponse resp = GoogleLoginResponse.newBuilder()
        .setSuccess(true)
        .setNeedsUsernamePrompt(needsPrompt)
        .setDisplayName(displayName)
        .build();

    return new LoginResult(resp, sessionToken);
  }

  // Updates display name (letters only) for an authenticated user tag.
  public SetUsernameResponse handleSetUsername(
      String userTag, SetUsernameRequest req) throws IOException {
    String desiredName = req.getDesiredName();
    if (desiredName == null || !USERNAME_PATTERN.matcher(desiredName).matches()) {
      return SetUsernameResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Username must contain only letters (a-zA-Z)")
          .build();
    }

    Optional<User> userOpt = userDb.findByTag(userTag);
    if (userOpt.isEmpty()) {
      return SetUsernameResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("User not found")
          .build();
    }

    User user = userOpt.get();
    User updatedUser = user.toBuilder()
        .setUsername(desiredName + "#" + userTag)
        .build();
    userDb.saveUser(updatedUser);

    return SetUsernameResponse.newBuilder()
        .setSuccess(true)
        .setDisplayName(desiredName)
        .build();
  }

  // Generates 16-byte random hex/base64 session token.
  private String generateSessionToken() {
    byte[] bytes = new byte[24];
    secureRandom.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  // Generates 4-digit numeric tag unique across user database.
  private String generateUniqueTag() throws IOException {
    while (true) {
      int num = 1000 + secureRandom.nextInt(9000);
      String tag = String.valueOf(num);
      if (userDb.findByTag(tag).isEmpty()) {
        return tag;
      }
    }
  }

  // Sanitizes name from Google auth, falling back to "User" if no letters.
  private String sanitizeGoogleName(String name) {
    if (name == null) {
      return "User";
    }
    String cleaned = name.replaceAll("[^a-zA-Z]", "");
    return cleaned.isEmpty() ? "User" : cleaned;
  }

  // Helper DTO for extracted Google token payload.
  public static class GoogleUserInfo {
    public final String googleId;
    public final String email;
    public final String name;

    public GoogleUserInfo(String googleId, String email, String name) {
      this.googleId = googleId;
      this.email = email;
      this.name = name;
    }
  }

  // Parses JWT payload (extracts sub, email, name).
  public static GoogleUserInfo parseGoogleIdToken(String token) {
    String[] parts = token.split("\\.");
    if (parts.length < 2) {
      return new GoogleUserInfo(token, "user@example.com", "User");
    }
    try {
      byte[] decoded = Base64.getUrlDecoder().decode(parts[1]);
      String json = new String(decoded, StandardCharsets.UTF_8);
      String sub = extractJsonField(json, "sub");
      String email = extractJsonField(json, "email");
      String name = extractJsonField(json, "name");
      if (sub == null || sub.isEmpty()) {
        sub = token;
      }
      return new GoogleUserInfo(
          sub,
          email != null ? email : "",
          name != null ? name : "User");
    } catch (Exception e) {
      return new GoogleUserInfo(token, "user@example.com", "User");
    }
  }

  // Extracts simple string field value from JSON text.
  private static String extractJsonField(String json, String field) {
    String needle = "\"" + field + "\"";
    int idx = json.indexOf(needle);
    if (idx < 0) return null;
    int colon = json.indexOf(':', idx + needle.length());
    if (colon < 0) return null;
    int start = json.indexOf('"', colon + 1);
    if (start < 0) return null;
    int end = json.indexOf('"', start + 1);
    if (end < 0) return null;
    return json.substring(start + 1, end);
  }
}
