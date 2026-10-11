package com.doki.integration;

import com.doki.dbs.SessionDb;
import com.doki.dbs.UserDb;
import com.doki.proto.auth.GetMeResponse;
import com.doki.proto.auth.GoogleLoginRequest;
import com.doki.proto.auth.GoogleLoginResponse;
import com.doki.proto.auth.SetUsernameRequest;
import com.doki.proto.auth.SetUsernameResponse;
import com.doki.proto.auth.User;
import com.doki.server.AuthHandler;
import com.doki.server.DokiHttpsServer;
import com.doki.service.AuthService;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.Base64;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * End-to-end integration test for the HTTPS auth service.
 */
public class AuthIntegrationTest {

  // Runs full suite of integration tests against HTTPS server.
  public static void main(String[] args) throws Exception {
    System.out.println("Starting AuthIntegrationTest...");
    setupTrustAllSsl();

    File testStorage = new File("run/storage/test");
    testStorage.mkdirs();
    File userFile = new File(testStorage, "users.textproto");
    File sessionFile = new File(testStorage, "sessions.textproto");
    userFile.delete();
    sessionFile.delete();

    UserDb userDb = new UserDb(userFile);
    SessionDb sessionDb = new SessionDb(sessionFile);
    AuthService authService = new AuthService(userDb, sessionDb);
    AuthHandler authHandler =
        new AuthHandler(authService, sessionDb, userDb);

    int testPort = 8444;
    DokiHttpsServer server = new DokiHttpsServer(testPort);
    server.createContext("/api/auth", authHandler);
    server.start();

    try {
      testAuthFlow(testPort, userDb);
      System.out.println("ALL INTEGRATION TESTS PASSED!");
    } finally {
      server.stop(0);
      userFile.delete();
      sessionFile.delete();
      testStorage.delete();
    }
  }

  // Executes login, get_me, set_username, and logout steps.
  private static void testAuthFlow(int port, UserDb userDb)
      throws Exception {
    String testGoogleId = "google_user_12345";
    String fakeJwt = createFakeJwt(testGoogleId, "alice@example.com", "Alice");

    // 1. Google Login (First time)
    GoogleLoginRequest loginReq = GoogleLoginRequest.newBuilder()
        .setIdToken(fakeJwt)
        .build();
    HttpResult res = postProto(
        "https://localhost:" + port + "/api/auth/google",
        loginReq.toByteArray(), null);

    assertEqual(res.status, 200, "Login HTTP status");
    GoogleLoginResponse loginResp =
        GoogleLoginResponse.parseFrom(res.body);
    assertTrue(loginResp.getSuccess(), "Login success");
    assertTrue(loginResp.getNeedsUsernamePrompt(), "Needs username prompt");
    assertEqual(loginResp.getDisplayName(), "Alice", "Initial display name");

    String cookie = res.cookie;
    assertTrue(cookie != null && cookie.contains("doki_session="),
        "Session cookie present");

    // Check user in database
    User user = userDb.findByGoogleId(testGoogleId).orElseThrow();
    String tag = UserDb.extractTag(user.getUsername());
    assertTrue(!tag.isEmpty(), "User tag generated");
    assertEqual(user.getUsername(), "Alice#" + tag, "Username matches");

    // 2. GET /api/auth/me
    HttpResult meRes = getProto(
        "https://localhost:" + port + "/api/auth/me", cookie);
    assertEqual(meRes.status, 200, "GetMe status");
    GetMeResponse meResp = GetMeResponse.parseFrom(meRes.body);
    assertTrue(meResp.getAuthenticated(), "Authenticated");
    assertEqual(meResp.getDisplayName(), "Alice", "GetMe display name (tag stripped)");

    // 3. POST /api/auth/set_username
    SetUsernameRequest setReq = SetUsernameRequest.newBuilder()
        .setDesiredName("Alicia")
        .build();
    HttpResult setRes = postProto(
        "https://localhost:" + port + "/api/auth/set_username",
        setReq.toByteArray(), cookie);
    assertEqual(setRes.status, 200, "Set username status");
    SetUsernameResponse setResp = SetUsernameResponse.parseFrom(setRes.body);
    assertTrue(setResp.getSuccess(), "Set username success");
    assertEqual(setResp.getDisplayName(), "Alicia", "Updated display name");

    // Verify persisted username has updated name but same tag
    User updatedUser = userDb.findByTag(tag).orElseThrow();
    assertEqual(updatedUser.getUsername(), "Alicia#" + tag, "Updated tag preserved");

    // 4. Invalid username check (must be a-zA-Z only)
    SetUsernameRequest invalidReq = SetUsernameRequest.newBuilder()
        .setDesiredName("Alicia123!")
        .build();
    HttpResult invRes = postProto(
        "https://localhost:" + port + "/api/auth/set_username",
        invalidReq.toByteArray(), cookie);
    SetUsernameResponse invResp = SetUsernameResponse.parseFrom(invRes.body);
    assertTrue(!invResp.getSuccess(), "Validation rejected invalid characters");

    // 5. Logout
    HttpResult logoutRes = postProto(
        "https://localhost:" + port + "/api/auth/logout",
        new byte[0], cookie);
    assertEqual(logoutRes.status, 204, "Logout status");

    // 6. GET /api/auth/me after logout
    HttpResult meAfterLogout = getProto(
        "https://localhost:" + port + "/api/auth/me", cookie);
    GetMeResponse meAfterResp = GetMeResponse.parseFrom(meAfterLogout.body);
    assertTrue(!meAfterResp.getAuthenticated(), "Unauthenticated after logout");
  }

  // Sends HTTPS POST request with proto payload and optional cookie.
  private static HttpResult postProto(
      String urlStr, byte[] payload, String cookie) throws Exception {
    URL url = new URL(urlStr);
    HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
    conn.setRequestMethod("POST");
    conn.setDoOutput(true);
    if (cookie != null) conn.setRequestProperty("Cookie", cookie);
    conn.setRequestProperty("Content-Type", "application/x-protobuf");

    if (payload.length > 0) {
      try (OutputStream os = conn.getOutputStream()) {
        os.write(payload);
      }
    } else {
      conn.setFixedLengthStreamingMode(0);
      conn.connect();
    }

    int code = conn.getResponseCode();
    String setCookie = conn.getHeaderField("Set-Cookie");
    byte[] body = code < 400 ?
        readAll(conn.getInputStream()) :
        (conn.getErrorStream() != null ? readAll(conn.getErrorStream()) : new byte[0]);
    return new HttpResult(code, body, setCookie);
  }

  // Sends HTTPS GET request and reads response body and headers.
  private static HttpResult getProto(String urlStr, String cookie)
      throws Exception {
    URL url = new URL(urlStr);
    HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
    conn.setRequestMethod("GET");
    if (cookie != null) conn.setRequestProperty("Cookie", cookie);

    int code = conn.getResponseCode();
    String setCookie = conn.getHeaderField("Set-Cookie");
    byte[] body = code < 400 ?
        readAll(conn.getInputStream()) :
        (conn.getErrorStream() != null ? readAll(conn.getErrorStream()) : new byte[0]);
    return new HttpResult(code, body, setCookie);
  }

  // Reads all bytes from stream.
  private static byte[] readAll(InputStream is) throws Exception {
    try (is) {
      return is.readAllBytes();
    }
  }

  // Helper response holder.
  private static class HttpResult {
    final int status;
    final byte[] body;
    final String cookie;
    HttpResult(int status, byte[] body, String cookie) {
      this.status = status;
      this.body = body;
      this.cookie = cookie;
    }
  }

  // Creates simple dummy JWT with given payload claims.
  private static String createFakeJwt(String sub, String email, String name) {
    String header = "{\"alg\":\"none\"}";
    String payload = String.format(
        "{\"sub\":\"%s\",\"email\":\"%s\",\"name\":\"%s\"}",
        sub, email, name);
    Base64.Encoder enc = Base64.getUrlEncoder().withoutPadding();
    return enc.encodeToString(header.getBytes()) + "." +
        enc.encodeToString(payload.getBytes()) + ".sig";
  }

  // Configures SSL context to trust self-signed local certs for integration tests.
  private static void setupTrustAllSsl() throws Exception {
    TrustManager[] trustAll = new TrustManager[]{
        new X509TrustManager() {
          public X509Certificate[] getAcceptedIssuers() { return null; }
          public void checkClientTrusted(X509Certificate[] c, String a) {}
          public void checkServerTrusted(X509Certificate[] c, String a) {}
        }
    };
    SSLContext sc = SSLContext.getInstance("TLS");
    sc.init(null, trustAll, new SecureRandom());
    HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
    HttpsURLConnection.setDefaultHostnameVerifier((s, sslSession) -> true);
  }

  // Assertion helpers.
  private static void assertTrue(boolean cond, String msg) {
    if (!cond) throw new AssertionError("FAILED: " + msg);
  }

  private static void assertEqual(Object a, Object b, String msg) {
    if (!java.util.Objects.equals(a, b)) {
      throw new AssertionError("FAILED: " + msg + " expected [" + b + "] but got [" + a + "]");
    }
  }
}
