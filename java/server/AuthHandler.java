package com.doki.server;

import com.doki.dbs.SessionDb;
import com.doki.dbs.UserDb;
import com.doki.proto.auth.GetMeResponse;
import com.doki.proto.auth.GoogleLoginRequest;
import com.doki.proto.auth.Session;
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
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Optional;

/**
 * HTTP handler routing /api/auth/* endpoints with session verification.
 */
public class AuthHandler implements HttpHandler {
  private final AuthService authService;
  private final SessionDb sessionDb;
  private final UserDb userDb;
  private final File configFile;

  // Constructs AuthHandler with dependencies.
  public AuthHandler(
      AuthService authService,
      SessionDb sessionDb,
      UserDb userDb,
      File configFile) {
    this.authService = authService;
    this.sessionDb = sessionDb;
    this.userDb = userDb;
    this.configFile = configFile;
  }

  // Routes incoming HTTP requests to corresponding auth handlers.
  @Override
  public void handle(HttpExchange exchange) throws IOException {
    String path = exchange.getRequestURI().getPath();
    String method = exchange.getRequestMethod();

    if ("/api/auth/config".equals(path) && "GET".equalsIgnoreCase(method)) {
      handleGetConfig(exchange);
    } else if ("/api/auth/google".equals(path) &&
               "POST".equalsIgnoreCase(method)) {
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
    String clientId = extractClientId().orElse("");
    String resp = "{\"client_id\":\"" + clientId + "\"}";
    byte[] bytes = resp.getBytes(StandardCharsets.UTF_8);
    exchange.getResponseHeaders().set(
        "Content-Type", "application/json; charset=UTF-8");
    exchange.sendResponseHeaders(200, bytes.length);
    try (OutputStream os = exchange.getResponseBody()) {
      os.write(bytes);
    }
  }

  // Extracts client_id from config file safely.
  private Optional<String> extractClientId() {
    if (!configFile.exists()) {
      return Optional.empty();
    }
    try {
      String json = Files.readString(configFile.toPath());
      int idx = json.indexOf("\"client_id\":");
      if (idx >= 0) {
        int start = json.indexOf('"', idx + 12);
        int end = json.indexOf('"', start + 1);
        if (start >= 0 && end > start) {
          return Optional.of(json.substring(start + 1, end));
        }
      }
    } catch (IOException ignored) {}
    return Optional.empty();
  }

  // Authenticates incoming request by checking doki_session cookie.
  public Optional<Session> authenticateRequest(HttpExchange exchange)
      throws IOException {
    Optional<String> tokenOpt = extractCookie(exchange, "doki_session");
    if (tokenOpt.isEmpty()) {
      return Optional.empty();
    }
    long now = System.currentTimeMillis();
    return sessionDb.findValidSession(tokenOpt.get(), now);
  }

  // Handles Google ID token login endpoint.
  private void handleGoogleLogin(HttpExchange exchange) throws IOException {
    GoogleLoginRequest.Builder builder = GoogleLoginRequest.newBuilder();
    String ct = exchange.getRequestHeaders().getFirst("Content-Type");
    if (ct != null && ct.contains("application/json")) {
      String json = new String(
          exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
      com.google.protobuf.util.JsonFormat.parser()
          .ignoringUnknownFields().merge(json, builder);
    } else {
      builder.mergeFrom(exchange.getRequestBody());
    }
    GoogleLoginRequest req = builder.build();
    AuthService.LoginResult res = authService.handleGoogleLogin(req);

    res.sessionToken.ifPresent(token -> {
      exchange.getResponseHeaders().add(
          "Set-Cookie",
          "doki_session=" + token +
          "; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=604800");
    });
    sendProtoResponse(exchange, 200, res.response);
  }

  // Handles setting display name for authenticated user.
  private void handleSetUsername(HttpExchange exchange) throws IOException {
    Optional<Session> sessionOpt = authenticateRequest(exchange);
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
          exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
      com.google.protobuf.util.JsonFormat.parser()
          .ignoringUnknownFields().merge(json, builder);
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
    Optional<Session> sessionOpt = authenticateRequest(exchange);
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
    Optional<String> tokenOpt = extractCookie(exchange, "doki_session");
    if (tokenOpt.isPresent()) {
      sessionDb.removeSession(tokenOpt.get());
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
      byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
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

  // Extracts optional specific cookie value from Cookie header.
  private Optional<String> extractCookie(HttpExchange exchange, String name) {
    String cookieHeader = exchange.getRequestHeaders().getFirst("Cookie");
    if (cookieHeader == null) return Optional.empty();
    String[] cookies = cookieHeader.split(";");
    for (String c : cookies) {
      String trimmed = c.trim();
      if (trimmed.startsWith(name + "=")) {
        return Optional.of(trimmed.substring(name.length() + 1));
      }
    }
    return Optional.empty();
  }
}
