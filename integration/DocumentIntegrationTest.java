package com.doki.integration;

import com.doki.dbs.SessionDb;
import com.doki.dbs.UserDb;
import com.doki.document.dbs.DocumentDb;
import com.doki.document.server.DocumentHandler;
import com.doki.document.service.DocumentService;
import com.doki.proto.auth.Session;
import com.doki.proto.auth.User;
import com.doki.proto.document.BatchRenamePrefixRequest;
import com.doki.proto.document.BatchRenamePrefixResponse;
import com.doki.proto.document.CreateDocumentRequest;
import com.doki.proto.document.CreateDocumentResponse;
import com.doki.proto.document.DeleteDocumentRequest;
import com.doki.proto.document.DeleteDocumentResponse;
import com.doki.proto.document.DeletePrefixRequest;
import com.doki.proto.document.DeletePrefixResponse;
import com.doki.proto.document.GetDocumentResponse;
import com.doki.proto.document.ListDocumentsResponse;
import com.doki.proto.document.UpdateDocumentRequest;
import com.doki.proto.document.UpdateDocumentResponse;
import com.doki.proto.workspace.Workspace;
import com.doki.server.DokiHttpsServer;
import com.doki.workspace.dbs.WorkspaceDb;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.security.cert.X509Certificate;
import java.util.UUID;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * End-to-end integration test for document CRUD and directory management.
 */
public class DocumentIntegrationTest {

  // Runs full document integration test suite.
  public static void main(String[] args) throws Exception {
    System.out.println("Starting DocumentIntegrationTest...");
    setupTrustAllSsl();

    File testStorage = new File("run/storage/doctest");
    testStorage.mkdirs();
    File userFile = new File(testStorage, "users.textproto");
    File sessionFile = new File(testStorage, "sessions.textproto");
    File wsFile = new File(testStorage, "workspaces.textproto");
    File docFile = new File(testStorage, "documents.textproto");

    UserDb userDb = new UserDb(userFile);
    SessionDb sessionDb = new SessionDb(sessionFile);
    WorkspaceDb wsDb = new WorkspaceDb(wsFile);
    DocumentDb docDb = new DocumentDb(docFile);

    String email = "testuser@example.com";
    userDb.saveUser(User.newBuilder()
        .setEmail(email)
        .setUsername("tester")
        .build());

    String wsId = UUID.randomUUID().toString();
    wsDb.saveWorkspace(Workspace.newBuilder()
        .setWorkspaceId(wsId)
        .setName("Personal")
        .setOwnerEmail(email)
        .setIsPersonal(true)
        .build());

    String sessionToken = "valid_test_token_123456789";
    sessionDb.saveSession(Session.newBuilder()
        .setSessionToken(sessionToken)
        .setUserId(email)
        .setExpiresAtMs(System.currentTimeMillis() + 3600000)
        .build());

    DocumentService docService = new DocumentService(docDb, wsDb);
    DocumentHandler docHandler = new DocumentHandler(docService, sessionDb);

    int testPort = 8445;
    DokiHttpsServer server = new DokiHttpsServer(testPort);
    server.createContext("/api/documents", docHandler);
    server.start();

    String cookie = "doki_session=" + sessionToken;

    try {
      // 1. Create document with content
      CreateDocumentRequest createReq = CreateDocumentRequest.newBuilder()
          .setWorkspaceId(wsId)
          .setName("notes/todo.md")
          .setContent("# My Todos\n- Shard 0 content")
          .build();
      HttpResult cRes = postProto(
          "https://localhost:" + testPort + "/api/documents",
          createReq.toByteArray(), cookie);
      assertEqual(cRes.status, 200, "Create document status");
      CreateDocumentResponse cResp =
          CreateDocumentResponse.parseFrom(cRes.body);
      assertTrue(cResp.getSuccess(), "Create document success");
      String docId = cResp.getDocument().getDocumentId();
      UUID.fromString(docId);
      assertEqual(cResp.getDocument().getShards(0).getContent(),
          "# My Todos\n- Shard 0 content", "Shard 0 content match");

      // 2. Space in file name must be rejected
      CreateDocumentRequest spaceReq = CreateDocumentRequest.newBuilder()
          .setWorkspaceId(wsId)
          .setName("notes/my invalid todo.md")
          .setContent("text")
          .build();
      HttpResult spaceRes = postProto(
          "https://localhost:" + testPort + "/api/documents",
          spaceReq.toByteArray(), cookie);
      CreateDocumentResponse spaceResp =
          CreateDocumentResponse.parseFrom(spaceRes.body);
      assertTrue(!spaceResp.getSuccess(), "Spaces disallowed in document name");

      // 3. Get document
      HttpResult gRes = getProto(
          "https://localhost:" + testPort +
          "/api/documents/get?document_id=" + docId, cookie);
      assertEqual(gRes.status, 200, "Get document status");
      GetDocumentResponse gResp = GetDocumentResponse.parseFrom(gRes.body);
      assertTrue(gResp.getSuccess(), "Get document success");
      assertEqual(gResp.getDocument().getName(), "notes/todo.md", "Name match");

      // 4. Update document full string content
      UpdateDocumentRequest uReq = UpdateDocumentRequest.newBuilder()
          .setDocumentId(docId)
          .setContent("Updated content string")
          .build();
      HttpResult uRes = postProto(
          "https://localhost:" + testPort + "/api/documents/update",
          uReq.toByteArray(), cookie);
      UpdateDocumentResponse uResp =
          UpdateDocumentResponse.parseFrom(uRes.body);
      assertTrue(uResp.getSuccess(), "Update document success");
      assertEqual(uResp.getDocument().getShards(0).getContent(),
          "Updated content string", "Updated shard content");

      // 5. List documents in workspace
      HttpResult lRes = getProto(
          "https://localhost:" + testPort +
          "/api/documents?workspace_id=" + wsId, cookie);
      ListDocumentsResponse lResp =
          ListDocumentsResponse.parseFrom(lRes.body);
      assertEqual(lResp.getDocumentsCount(), 1, "Document count in list");

      // 6. Batch rename directory prefix
      CreateDocumentRequest doc2Req = CreateDocumentRequest.newBuilder()
          .setWorkspaceId(wsId)
          .setName("src/main.py")
          .setContent("print('hello')")
          .build();
      postProto("https://localhost:" + testPort + "/api/documents",
          doc2Req.toByteArray(), cookie);

      BatchRenamePrefixRequest renReq = BatchRenamePrefixRequest.newBuilder()
          .setWorkspaceId(wsId)
          .setOldPrefix("src")
          .setNewPrefix("app")
          .build();
      HttpResult renRes = postProto(
          "https://localhost:" + testPort +
          "/api/documents/batch_rename_prefix",
          renReq.toByteArray(), cookie);
      BatchRenamePrefixResponse renResp =
          BatchRenamePrefixResponse.parseFrom(renRes.body);
      assertTrue(renResp.getSuccess(), "Batch rename prefix success");
      assertEqual(renResp.getModifiedCount(), 1, "1 document prefix updated");

      // 7. Delete document
      DeleteDocumentRequest delReq = DeleteDocumentRequest.newBuilder()
          .setDocumentId(docId)
          .build();
      HttpResult dRes = postProto(
          "https://localhost:" + testPort + "/api/documents/delete",
          delReq.toByteArray(), cookie);
      DeleteDocumentResponse dResp =
          DeleteDocumentResponse.parseFrom(dRes.body);
      assertTrue(dResp.getSuccess(), "Delete document success");

      // 8. Delete directory prefix
      DeletePrefixRequest delPrefReq = DeletePrefixRequest.newBuilder()
          .setWorkspaceId(wsId)
          .setPrefix("app")
          .build();
      HttpResult dpRes = postProto(
          "https://localhost:" + testPort + "/api/documents/delete_prefix",
          delPrefReq.toByteArray(), cookie);
      DeletePrefixResponse dpResp =
          DeletePrefixResponse.parseFrom(dpRes.body);
      assertTrue(dpResp.getSuccess(), "Delete prefix success");
      assertEqual(dpResp.getDeletedCount(), 1, "1 document removed by prefix");

      System.out.println("ALL DOCUMENT INTEGRATION TESTS PASSED!");
    } finally {
      server.stop(0);
      userFile.delete();
      sessionFile.delete();
      wsFile.delete();
      docFile.delete();
      testStorage.delete();
    }
  }

  // Response helper structure for HTTP calls.
  static class HttpResult {
    int status;
    byte[] body;
  }

  // Sends HTTP GET with session cookie.
  private static HttpResult getProto(String urlStr, String cookie)
      throws Exception {
    URL url = new URL(urlStr);
    HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
    conn.setRequestMethod("GET");
    conn.setRequestProperty("Accept", "application/x-protobuf");
    if (cookie != null) conn.setRequestProperty("Cookie", cookie);
    HttpResult res = new HttpResult();
    res.status = conn.getResponseCode();
    InputStream is = res.status < 400
        ? conn.getInputStream() : conn.getErrorStream();
    res.body = is != null ? readAll(is) : new byte[0];
    return res;
  }

  // Sends HTTP POST with protobuf payload.
  private static HttpResult postProto(
      String urlStr, byte[] body, String cookie) throws Exception {
    URL url = new URL(urlStr);
    HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
    conn.setRequestMethod("POST");
    conn.setDoOutput(true);
    conn.setRequestProperty("Content-Type", "application/x-protobuf");
    conn.setRequestProperty("Accept", "application/x-protobuf");
    if (cookie != null) conn.setRequestProperty("Cookie", cookie);
    try (OutputStream os = conn.getOutputStream()) {
      os.write(body);
    }
    HttpResult res = new HttpResult();
    res.status = conn.getResponseCode();
    InputStream is = res.status < 400
        ? conn.getInputStream() : conn.getErrorStream();
    res.body = is != null ? readAll(is) : new byte[0];
    return res;
  }

  // Reads all stream bytes into memory.
  private static byte[] readAll(InputStream is) throws Exception {
    ByteArrayOutputStream baos = new ByteArrayOutputStream();
    byte[] buf = new byte[1024];
    int r;
    while ((r = is.read(buf)) != -1) baos.write(buf, 0, r);
    return baos.toByteArray();
  }

  // Asserts equality throwing descriptive error.
  private static void assertEqual(Object actual, Object expected, String msg) {
    if (!actual.equals(expected)) {
      throw new AssertionError(
          "FAILED: " + msg + " expected <" + expected + "> but got <" +
          actual + ">");
    }
  }

  // Asserts condition truth throwing descriptive error.
  private static void assertTrue(boolean cond, String msg) {
    if (!cond) throw new AssertionError("FAILED: " + msg);
  }

  // Trust all SSL certificates for local testing.
  private static void setupTrustAllSsl() throws Exception {
    TrustManager[] trustAll = new TrustManager[] {
      new X509TrustManager() {
        public X509Certificate[] getAcceptedIssuers() { return null; }
        public void checkClientTrusted(X509Certificate[] c, String a) {}
        public void checkServerTrusted(X509Certificate[] c, String a) {}
      }
    };
    SSLContext sc = SSLContext.getInstance("TLS");
    sc.init(null, trustAll, new java.security.SecureRandom());
    HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
    HttpsURLConnection.setDefaultHostnameVerifier((h, s) -> true);
  }
}
