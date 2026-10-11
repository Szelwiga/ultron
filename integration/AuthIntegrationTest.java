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
import com.doki.service.GoogleTokenVerifier;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.cert.X509Certificate;
import java.util.Base64;
import java.util.Optional;
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

    // Generate test RSA key pair for simulating Google signed tokens
    KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
    kpg.initialize(2048);
    KeyPair testKp = kpg.generateKeyPair();

    String testClientId = "test-client-id";
    GoogleTokenVerifier testVerifier = new GoogleTokenVerifier(testClientId) {
      @Override
      public Optional<VerifiedToken> verify(String token) {
        try {
          String[] parts = token.split("\\.");
          if (parts.length != 3) return Optional.empty();
          byte[] signedContent = (parts[0] + "." + parts[1]).getBytes();
          byte[] sigBytes = Base64.getUrlDecoder().decode(parts[2]);
          Signature sig = Signature.getInstance("SHA256withRSA");
          sig.initVerify(testKp.getPublic());
          sig.update(signedContent);
          if (!sig.verify(sigBytes)) return Optional.empty();
          String payload = new String(Base64.getUrlDecoder().decode(parts[1]));
          if (payload.contains("\"invalid\":true")) return Optional.empty();
          return Optional.of(new VerifiedToken("sub_12345", "alice@example.com", "Alice"));
        } catch (Exception e) {
          return Optional.empty();
        }
      }
    };

    UserDb userDb = new UserDb(userFile);
    SessionDb sessionDb = new SessionDb(sessionFile);
    File workspaceFile = new File(testStorage, "workspaces.textproto");
    workspaceFile.delete();
    com.doki.dbs.WorkspaceDb workspaceDb = new com.doki.dbs.WorkspaceDb(workspaceFile);
    com.doki.service.WorkspaceService workspaceService =
        new com.doki.service.WorkspaceService(workspaceDb, userDb);
    com.doki.server.WorkspaceHandler workspaceHandler =
        new com.doki.server.WorkspaceHandler(workspaceService, sessionDb);

    AuthService authService = new AuthService(userDb, sessionDb, testVerifier);
    File dummyConfig = new File(testStorage, "google_login.json");
    AuthHandler authHandler =
        new AuthHandler(authService, sessionDb, userDb, dummyConfig);

    int testPort = 8444;
    DokiHttpsServer server = new DokiHttpsServer(testPort);
    server.createContext("/api/auth", authHandler);
    server.createContext("/api/workspaces", workspaceHandler);
    server.start();

    try {
      testAuthFlow(testPort, userDb, testKp);
      System.out.println("ALL INTEGRATION TESTS PASSED!");
    } finally {
      server.stop(0);
      userFile.delete();
      sessionFile.delete();
      workspaceFile.delete();
      dummyConfig.delete();
      testStorage.delete();
    }
  }

  // Executes login, get_me, set_username, and logout steps.
  private static void testAuthFlow(
      int port, UserDb userDb, KeyPair testKp) throws Exception {
    String signedJwt = createSignedJwt(testKp, false);

    // 1. Google Login (First time) - username should be default empty
    GoogleLoginRequest loginReq = GoogleLoginRequest.newBuilder()
        .setIdToken(signedJwt)
        .build();
    HttpResult res = postProto(
        "https://localhost:" + port + "/api/auth/google",
        loginReq.toByteArray(), null);

    assertEqual(res.status, 200, "Login HTTP status");
    GoogleLoginResponse loginResp =
        GoogleLoginResponse.parseFrom(res.body);
    assertTrue(loginResp.getSuccess(), "Login success");
    assertEqual(loginResp.getUsername(), "", "Initial username empty");
    assertEqual(loginResp.getEmail(), "alice@example.com", "Email matches");

    String cookie = res.cookie;
    assertTrue(cookie != null && cookie.contains("doki_session="),
        "Session cookie present");

    // Check user in database by email
    User user = userDb.findByEmail("alice@example.com").orElseThrow();
    assertEqual(user.getEmail(), "alice@example.com", "User email stored");
    assertEqual(user.getUsername(), "", "User username empty");

    // 2. Reject forged / invalid token
    String invalidJwt = createSignedJwt(testKp, true);
    GoogleLoginRequest invalidLoginReq = GoogleLoginRequest.newBuilder()
        .setIdToken(invalidJwt)
        .build();
    HttpResult invAuthRes = postProto(
        "https://localhost:" + port + "/api/auth/google",
        invalidLoginReq.toByteArray(), null);
    GoogleLoginResponse invAuthResp =
        GoogleLoginResponse.parseFrom(invAuthRes.body);
    assertTrue(!invAuthResp.getSuccess(), "Rejected unverified token");

    // 3. GET /api/auth/me (before setting username)
    HttpResult meRes = getProto(
        "https://localhost:" + port + "/api/auth/me", cookie);
    assertEqual(meRes.status, 200, "GetMe status");
    GetMeResponse meResp = GetMeResponse.parseFrom(meRes.body);
    assertTrue(meResp.getAuthenticated(), "Authenticated");
    assertEqual(meResp.getUsername(), "", "GetMe username empty initially");
    assertEqual(meResp.getEmail(), "alice@example.com", "GetMe email present");

    // 4. POST /api/auth/set_username (via Settings)
    SetUsernameRequest setReq = SetUsernameRequest.newBuilder()
        .setDesiredName("Alicia")
        .build();
    HttpResult setRes = postProto(
        "https://localhost:" + port + "/api/auth/set_username",
        setReq.toByteArray(), cookie);
    assertEqual(setRes.status, 200, "Set username status");
    SetUsernameResponse setResp = SetUsernameResponse.parseFrom(setRes.body);
    assertTrue(setResp.getSuccess(), "Set username success");
    assertEqual(setResp.getUsername(), "Alicia", "Updated username");

    // Verify persisted username is updated for this email
    User updatedUser = userDb.findByEmail("alice@example.com").orElseThrow();
    assertEqual(updatedUser.getUsername(), "Alicia", "Persisted username matches");

    // 5. Invalid username check (must be a-zA-Z only)
    SetUsernameRequest invalidReq = SetUsernameRequest.newBuilder()
        .setDesiredName("Alicia123!")
        .build();
    HttpResult invRes = postProto(
        "https://localhost:" + port + "/api/auth/set_username",
        invalidReq.toByteArray(), cookie);
    SetUsernameResponse invResp = SetUsernameResponse.parseFrom(invRes.body);
    assertTrue(!invResp.getSuccess(), "Validation rejected invalid characters");

    // 6. Test Workspace Flow before logout
    testWorkspaceFlow(port, cookie);

    // 7. Logout
    HttpResult logoutRes = postProto(
        "https://localhost:" + port + "/api/auth/logout",
        new byte[0], cookie);
    assertEqual(logoutRes.status, 204, "Logout status");

    // 8. GET /api/auth/me after logout
    HttpResult meAfterLogout = getProto(
        "https://localhost:" + port + "/api/auth/me", cookie);
    GetMeResponse meAfterResp = GetMeResponse.parseFrom(meAfterLogout.body);
    assertTrue(!meAfterResp.getAuthenticated(), "Unauthenticated after logout");
  }

  // Tests full workspace lifecycle: list, create, update, collaborator, limits, delete.
  private static void testWorkspaceFlow(int port, String cookie) throws Exception {
    // 1. GET /api/workspaces (auto provisions default Personal workspace)
    HttpResult listRes = getProto("https://localhost:" + port + "/api/workspaces", cookie);
    assertEqual(listRes.status, 200, "List workspaces status");
    com.doki.proto.workspace.ListWorkspacesResponse listResp =
        com.doki.proto.workspace.ListWorkspacesResponse.parseFrom(listRes.body);
    assertTrue(listResp.getWorkspacesCount() >= 1, "Has default workspace");
    com.doki.proto.workspace.Workspace personalWs = listResp.getWorkspaces(0);
    assertEqual(personalWs.getName(), "Personal", "Default workspace named Personal");
    assertTrue(personalWs.getIsPersonal(), "Marked as personal");

    // Attempting to delete Personal workspace must fail
    com.doki.proto.workspace.DeleteWorkspaceRequest delPersonalReq =
        com.doki.proto.workspace.DeleteWorkspaceRequest.newBuilder()
            .setWorkspaceId(personalWs.getWorkspaceId())
            .build();
    HttpResult delPersRes = postProto("https://localhost:" + port + "/api/workspaces/delete",
        delPersonalReq.toByteArray(), cookie);
    com.doki.proto.workspace.DeleteWorkspaceResponse delPersResp =
        com.doki.proto.workspace.DeleteWorkspaceResponse.parseFrom(delPersRes.body);
    assertTrue(!delPersResp.getSuccess(), "Personal workspace cannot be deleted");

    // 2. POST /api/workspaces (create new workspace)
    com.doki.proto.workspace.CreateWorkspaceRequest createReq =
        com.doki.proto.workspace.CreateWorkspaceRequest.newBuilder()
            .setName("Project Ultron")
            .setDescription("Core harness and AI logic")
            .build();
    HttpResult createRes = postProto("https://localhost:" + port + "/api/workspaces",
        createReq.toByteArray(), cookie);
    assertEqual(createRes.status, 200, "Create workspace status");
    com.doki.proto.workspace.CreateWorkspaceResponse createResp =
        com.doki.proto.workspace.CreateWorkspaceResponse.parseFrom(createRes.body);
    assertTrue(createResp.getSuccess(), "Create workspace success");
    String ultronWsId = createResp.getWorkspace().getWorkspaceId();

    // 3. POST /api/workspaces/collaborators - check un-registered collaborator rejected
    com.doki.proto.workspace.ManageCollaboratorRequest addNonExistent =
        com.doki.proto.workspace.ManageCollaboratorRequest.newBuilder()
            .setWorkspaceId(ultronWsId)
            .setCollaboratorEmail("unknown@example.com")
            .setAction(com.doki.proto.workspace.ManageCollaboratorRequest.Action.ADD)
            .build();
    HttpResult failCollabRes = postProto("https://localhost:" + port + "/api/workspaces/collaborators",
        addNonExistent.toByteArray(), cookie);
    com.doki.proto.workspace.ManageCollaboratorResponse failCollabResp =
        com.doki.proto.workspace.ManageCollaboratorResponse.parseFrom(failCollabRes.body);
    assertTrue(!failCollabResp.getSuccess(), "Non-existent user rejected as collaborator");

    // Cannot add self/owner as collaborator
    com.doki.proto.workspace.ManageCollaboratorRequest addOwner =
        com.doki.proto.workspace.ManageCollaboratorRequest.newBuilder()
            .setWorkspaceId(ultronWsId)
            .setCollaboratorEmail("alice@example.com")
            .setAction(com.doki.proto.workspace.ManageCollaboratorRequest.Action.ADD)
            .build();
    HttpResult failOwnerRes = postProto("https://localhost:" + port + "/api/workspaces/collaborators",
        addOwner.toByteArray(), cookie);
    com.doki.proto.workspace.ManageCollaboratorResponse failOwnerResp =
        com.doki.proto.workspace.ManageCollaboratorResponse.parseFrom(failOwnerRes.body);
    assertTrue(!failOwnerResp.getSuccess(), "Owner rejected as collaborator");

    // 4. POST /api/workspaces/update (edit name/description)
    com.doki.proto.workspace.UpdateWorkspaceRequest updateReq =
        com.doki.proto.workspace.UpdateWorkspaceRequest.newBuilder()
            .setWorkspaceId(ultronWsId)
            .setName("Project Doki")
            .setDescription("Renamed project")
            .build();
    HttpResult updateRes = postProto("https://localhost:" + port + "/api/workspaces/update",
        updateReq.toByteArray(), cookie);
    assertEqual(updateRes.status, 200, "Update workspace status");
    com.doki.proto.workspace.UpdateWorkspaceResponse updateResp =
        com.doki.proto.workspace.UpdateWorkspaceResponse.parseFrom(updateRes.body);
    assertEqual(updateResp.getWorkspace().getName(), "Project Doki", "Updated name");

    // 5. POST /api/workspaces/delete (delete workspace)
    com.doki.proto.workspace.DeleteWorkspaceRequest delReq =
        com.doki.proto.workspace.DeleteWorkspaceRequest.newBuilder()
            .setWorkspaceId(ultronWsId)
            .build();
    HttpResult delRes = postProto("https://localhost:" + port + "/api/workspaces/delete",
        delReq.toByteArray(), cookie);
    assertEqual(delRes.status, 200, "Delete workspace status");
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

  // Creates RSA SHA256-signed test JWT.
  private static String createSignedJwt(KeyPair kp, boolean invalid) throws Exception {
    String header = "{\"alg\":\"RS256\",\"kid\":\"test-key-1\"}";
    String payload = invalid ? "{\"invalid\":true}" :
        "{\"sub\":\"sub_12345\",\"email\":\"alice@example.com\",\"name\":\"Alice\"}";
    Base64.Encoder enc = Base64.getUrlEncoder().withoutPadding();
    String signingInput = enc.encodeToString(header.getBytes()) + "." +
        enc.encodeToString(payload.getBytes());
    Signature sig = Signature.getInstance("SHA256withRSA");
    sig.initSign(kp.getPrivate());
    sig.update(signingInput.getBytes());
    byte[] signatureBytes = sig.sign();
    return signingInput + "." + enc.encodeToString(signatureBytes);
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
