package com.doki.server;

import com.doki.dbs.SessionDb;
import com.doki.dbs.UserDb;
import com.doki.proto.auth.GetMeResponse;
import com.doki.proto.auth.GoogleLoginRequest;
import com.doki.proto.auth.SetUsernameRequest;
import com.doki.proto.auth.SetUsernameResponse;
import com.doki.proto.auth.User;
import com.doki.service.AuthService;
import com.google.protobuf.Message;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Optional;

/**
 * HTTP handler routing /api/auth/* endpoints.
 */
public class AuthHandler implements HttpHandler {
  private final AuthService authService;
  private final SessionDb sessionDb;
  private final UserDb userDb;

  // Constructs AuthHandler with dependencies.
  public AuthHandler(
      AuthService authService, SessionDb sessionDb, UserDb userDb) {
    this.authService = authService;
    this.sessionDb = sessionDb;
    this.userDb = userDb;
  }

  // Routes incoming HTTP requests to corresponding auth handlers.
  @Override
  public void handle(HttpExchange exchange) throws IOException {
    String path = exchange.getRequestURI().getPath();
    String method = exchange.getRequestMethod();

    if ("/api/auth/config".equals(path) && "GET".equalsIgnoreCase(method)) {
      handleGetConfig(exchange);
    } else if ("/api/auth/google".equals(path) && "POST".equalsIgnoreCase(method)) {
      handleGoogleLogin(exchange);
    } else if ("/api/auth/set_username".equals(path) &&
               "POST".equalsIgnoreCase(method)) {
      handleSetUsername(exchange);
    } else if ("/api/auth/me".equals(path) &&
               "GET".equalsIgnoreCase(method)) {
      handleGetMe(exchange);
    } else if ("/api/auth/logout".equals(path) &&
               "POST".equalsIgnoreCase(method)) {
      handleLogout(exchange);
    } else {
      exchange.sendResponseHeaders(404, -1);
    }
  }

  // Serves Google client ID to frontend.
  private void handleGetConfig(HttpExchange exchange) throws IOException {
    String clientId = "";
    File configFile = new File("env/google_login.json");
    if (configFile.exists()) {
      String json = java.nio.file.Files.readString(configFile.toPath());
      int idx = json.indexOf("\"client_id\":");
      if (idx >= 0) {
        int start = json.indexOf('"', idx + 12);
        int end = json.indexOf('"', start + 1);
        if (start >= 0 && end > start) {
          clientId = json.substring(start + 1, end);
        }
      }
    }
    String resp = "{\"client_id\":\"" + clientId + "\"}";
    byte[] bytes = resp.getBytes(java.nio.charset.StandardCharsets.UTF_8);
    exchange.getResponseHeaders().set(
        "Content-Type", "application/json; charset=UTF-8");
    exchange.sendResponseHeaders(200, bytes.length);
    try (OutputStream os = exchange.getResponseBody()) {
      os.write(bytes);
    }
  }

  // Handles Google ID token login endpoint.
  private void handleGoogleLogin(HttpExchange exchange) throws IOException {
    GoogleLoginRequest.Builder builder = GoogleLoginRequest.newBuilder();
    String ct = exchange.getRequestHeaders().getFirst("Content-Type");
    if (ct != null && ct.contains("application/json")) {
      String json = new String(
          exchange.getRequestBody().readAllBytes(),
          java.nio.charset.StandardCharsets.UTF_8);
      com.google.protobuf.util.JsonFormat.parser().ignoringUnknownFields().merge(json, builder);
    } else {
      builder.mergeFrom(exchange.getRequestBody());
    }
    GoogleLoginRequest req = builder.build();
    AuthService.LoginResult res = authService.handleGoogleLogin(req);

    if (res.sessionToken != null) {
      exchange.getResponseHeaders().add(
          "Set-Cookie",
          "doki_session=" + res.sessionToken +
          "; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=604800");
    }
    sendProtoResponse(exchange, 200, res.response);
  }

  // Handles setting display name for authenticated user.
  private void handleSetUsername(HttpExchange exchange) throws IOException {
    String token = extractCookie(exchange, "doki_session");
    long now = System.currentTimeMillis();
    Optional<com.doki.proto.auth.Session> sessionOpt = token == null
        ? Optional.empty()
        : sessionDb.findValidSession(token, now);

    if (sessionOpt.isEmpty()) {
      SetUsernameResponse err = SetUsernameResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Unauthorized")
          .build();
      sendProtoResponse(exchange, 401, err);
      return;
    }

    SetUsernameRequest.Builder builder = SetUsernameRequest.newBuilder();
    String ct = exchange.getRequestHeaders().getFirst("Content-Type");
    if (ct != null && ct.contains("application/json")) {
      String json = new String(
          exchange.getRequestBody().readAllBytes(),
          java.nio.charset.StandardCharsets.UTF_8);
      com.google.protobuf.util.JsonFormat.parser().ignoringUnknownFields().merge(json, builder);
    } else {
      builder.mergeFrom(exchange.getRequestBody());
    }
    SetUsernameRequest req = builder.build();
    SetUsernameResponse res =
        authService.handleSetUsername(sessionOpt.get().getUserTag(), req);
    sendProtoResponse(exchange, 200, res);
  }

  // Handles returning currently authenticated user details.
  private void handleGetMe(HttpExchange exchange) throws IOException {
    String token = extractCookie(exchange, "doki_session");
    long now = System.currentTimeMillis();
    Optional<com.doki.proto.auth.Session> sessionOpt = token == null
        ? Optional.empty()
        : sessionDb.findValidSession(token, now);

    if (sessionOpt.isEmpty()) {
      GetMeResponse resp = GetMeResponse.newBuilder()
          .setAuthenticated(false)
          .build();
      sendProtoResponse(exchange, 200, resp);
      return;
    }

    Optional<User> userOpt =
        userDb.findByTag(sessionOpt.get().getUserTag());
    String name = userOpt.map(u -> UserDb.extractName(u.getUsername()))
        .orElse("");

    GetMeResponse resp = GetMeResponse.newBuilder()
        .setAuthenticated(true)
        .setDisplayName(name)
        .build();
    sendProtoResponse(exchange, 200, resp);
  }

  // Handles logging out and clearing session cookie.
  private void handleLogout(HttpExchange exchange) throws IOException {
    String token = extractCookie(exchange, "doki_session");
    if (token != null) {
      sessionDb.removeSession(token);
    }
    exchange.getResponseHeaders().add(
        "Set-Cookie",
        "doki_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0");
    exchange.sendResponseHeaders(204, -1);
  }

  // Serializes protobuf message to response stream (JSON or protobuf).
  private void sendProtoResponse(
      HttpExchange exchange, int statusCode, Message msg)
      throws IOException {
    String accept = exchange.getRequestHeaders().getFirst("Accept");
    if (accept != null && accept.contains("application/json")) {
      String json = com.google.protobuf.util.JsonFormat.printer().print(msg);
      byte[] bytes = json.getBytes(java.nio.charset.StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set(
          "Content-Type", "application/json; charset=UTF-8");
      exchange.sendResponseHeaders(statusCode, bytes.length);
      try (OutputStream os = exchange.getResponseBody()) {
        os.write(bytes);
      }
      return;
    }

    byte[] bytes = msg.toByteArray();
    exchange.getResponseHeaders().set(
        "Content-Type", "application/x-protobuf");
    exchange.sendResponseHeaders(statusCode, bytes.length);
    try (OutputStream os = exchange.getResponseBody()) {
      os.write(bytes);
    }
  }

  // Extracts specific cookie value from Cookie header.
  private String extractCookie(HttpExchange exchange, String name) {
    String cookieHeader = exchange.getRequestHeaders().getFirst("Cookie");
    if (cookieHeader == null) return null;
    String[] cookies = cookieHeader.split(";");
    for (String c : cookies) {
      String trimmed = c.trim();
      if (trimmed.startsWith(name + "=")) {
        return trimmed.substring(name.length() + 1);
      }
    }
    return null;
  }
}
