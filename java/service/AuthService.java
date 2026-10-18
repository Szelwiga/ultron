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
  private final GoogleTokenVerifier tokenVerifier;
  private final SecureRandom secureRandom = new SecureRandom();

  // Initializes AuthService with databases and token verifier.
  public AuthService(
      UserDb userDb,
      SessionDb sessionDb,
      GoogleTokenVerifier tokenVerifier) {
    this.userDb = userDb;
    this.sessionDb = sessionDb;
    this.tokenVerifier = tokenVerifier;
  }

  // Result object holding API response and optional generated session token.
  public static class LoginResult {
    public final GoogleLoginResponse response;
    public final Optional<String> sessionToken;

    public LoginResult(GoogleLoginResponse resp, Optional<String> token) {
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
          .build(), Optional.empty());
    }

    Optional<GoogleTokenVerifier.VerifiedToken> verifiedOpt =
        tokenVerifier.verify(idToken);
    if (verifiedOpt.isEmpty()) {
      return new LoginResult(GoogleLoginResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Invalid or unverified ID token")
          .build(), Optional.empty());
    }

    GoogleTokenVerifier.VerifiedToken info = verifiedOpt.get();
    Optional<User> existingUser = userDb.findByGoogleId(info.subject);
    User user;

    if (existingUser.isPresent()) {
      user = existingUser.get();
    } else {
      user = User.newBuilder()
          .setEmail(info.email)
          .setUsername("") // default empty
          .setGoogleId(info.subject)
          .build();
      userDb.saveUser(user);
    }

    String sessionToken = generateSessionToken();
    long expiresAt = System.currentTimeMillis() + SESSION_DURATION_MS;

    sessionDb.saveSession(Session.newBuilder()
        .setSessionToken(sessionToken)
        .setUserId(user.getEmail())
        .setExpiresAtMs(expiresAt)
        .build());

    GoogleLoginResponse resp = GoogleLoginResponse.newBuilder()
        .setSuccess(true)
        .setUsername(user.getUsername())
        .setEmail(user.getEmail())
        .build();

    return new LoginResult(resp, Optional.of(sessionToken));
  }

  // Updates username (letters only) for an authenticated user email.
  public SetUsernameResponse handleSetUsername(
      String userEmail, SetUsernameRequest req) throws IOException {
    String desiredName = req.getDesiredName();
    if (desiredName == null ||
        !USERNAME_PATTERN.matcher(desiredName).matches()) {
      return SetUsernameResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Username must contain only letters (a-zA-Z)")
          .build();
    }

    Optional<User> userOpt = userDb.findByEmail(userEmail);
    if (userOpt.isEmpty()) {
      return SetUsernameResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("User not found")
          .build();
    }

    User user = userOpt.get();
    User updatedUser = user.toBuilder()
        .setUsername(desiredName)
        .build();
    userDb.saveUser(updatedUser);

    return SetUsernameResponse.newBuilder()
        .setSuccess(true)
        .setUsername(desiredName)
        .build();
  }

  // Generates 24-byte random url-safe base64 session token.
  private String generateSessionToken() {
    byte[] bytes = new byte[24];
    secureRandom.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }
}
