package com.doki.document.server;

import com.doki.dbs.SessionDb;
import com.doki.document.service.DocumentService;
import com.doki.proto.auth.Session;
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
import com.doki.proto.document.RenameDocumentRequest;
import com.doki.proto.document.RenameDocumentResponse;
import com.doki.proto.document.UpdateDocumentRequest;
import com.doki.proto.document.UpdateDocumentResponse;
import com.google.protobuf.Message;
import com.google.protobuf.util.JsonFormat;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * HTTP handler routing /api/documents/* endpoints.
 */
public class DocumentHandler implements HttpHandler {
  private final DocumentService documentService;
  private final SessionDb sessionDb;

  // Constructs DocumentHandler with service and session database.
  public DocumentHandler(
      DocumentService documentService, SessionDb sessionDb) {
    this.documentService = documentService;
    this.sessionDb = sessionDb;
  }

  // Dispatches incoming request to matching document action.
  @Override
  public void handle(HttpExchange exchange) throws IOException {
    Optional<Session> sessionOpt = authenticateRequest(exchange);
    if (sessionOpt.isEmpty()) {
      exchange.sendResponseHeaders(401, -1);
      return;
    }

    String userEmail = sessionOpt.get().getUserId();
    String path = exchange.getRequestURI().getPath();
    String method = exchange.getRequestMethod();

    if ("/api/documents".equals(path) && "GET".equalsIgnoreCase(method)) {
      handleList(exchange, userEmail);
    } else if ("/api/documents/get".equals(path) &&
               "GET".equalsIgnoreCase(method)) {
      handleGet(exchange, userEmail);
    } else if ("/api/documents".equals(path) &&
               "POST".equalsIgnoreCase(method)) {
      handleCreate(exchange, userEmail);
    } else if ("/api/documents/update".equals(path) &&
               "POST".equalsIgnoreCase(method)) {
      handleUpdate(exchange, userEmail);
    } else if ("/api/documents/rename".equals(path) &&
               "POST".equalsIgnoreCase(method)) {
      handleRename(exchange, userEmail);
    } else if ("/api/documents/batch_rename_prefix".equals(path) &&
               "POST".equalsIgnoreCase(method)) {
      handleBatchRenamePrefix(exchange, userEmail);
    } else if ("/api/documents/delete".equals(path) &&
               "POST".equalsIgnoreCase(method)) {
      handleDelete(exchange, userEmail);
    } else if ("/api/documents/delete_prefix".equals(path) &&
               "POST".equalsIgnoreCase(method)) {
      handleDeletePrefix(exchange, userEmail);
    } else {
      exchange.sendResponseHeaders(404, -1);
    }
  }

  // Lists all document summaries in a workspace.
  private void handleList(HttpExchange exchange, String userEmail)
      throws IOException {
    Map<String, String> query = parseQuery(exchange.getRequestURI().getQuery());
    String wsId = query.getOrDefault("workspace_id", "");
    ListDocumentsResponse resp =
        documentService.listDocuments(userEmail, wsId);
    sendResponse(exchange, 200, resp);
  }

  // Retrieves full document by document ID.
  private void handleGet(HttpExchange exchange, String userEmail)
      throws IOException {
    Map<String, String> query = parseQuery(exchange.getRequestURI().getQuery());
    String docId = query.getOrDefault("document_id", "");
    GetDocumentResponse resp =
        documentService.getDocument(userEmail, docId);
    sendResponse(exchange, resp.getSuccess() ? 200 : 404, resp);
  }

  // Creates new document with initial content.
  private void handleCreate(HttpExchange exchange, String userEmail)
      throws IOException {
    CreateDocumentRequest.Builder b = CreateDocumentRequest.newBuilder();
    parseRequestBody(exchange, b);
    CreateDocumentResponse resp =
        documentService.createDocument(userEmail, b.build());
    sendResponse(exchange, resp.getSuccess() ? 200 : 400, resp);
  }

  // Updates document string content.
  private void handleUpdate(HttpExchange exchange, String userEmail)
      throws IOException {
    UpdateDocumentRequest.Builder b = UpdateDocumentRequest.newBuilder();
    parseRequestBody(exchange, b);
    UpdateDocumentResponse resp =
        documentService.updateDocument(userEmail, b.build());
    sendResponse(exchange, resp.getSuccess() ? 200 : 400, resp);
  }

  // Renames single document.
  private void handleRename(HttpExchange exchange, String userEmail)
      throws IOException {
    RenameDocumentRequest.Builder b = RenameDocumentRequest.newBuilder();
    parseRequestBody(exchange, b);
    RenameDocumentResponse resp =
        documentService.renameDocument(userEmail, b.build());
    sendResponse(exchange, resp.getSuccess() ? 200 : 400, resp);
  }

  // Batch renames directory path prefix.
  private void handleBatchRenamePrefix(
      HttpExchange exchange, String userEmail) throws IOException {
    BatchRenamePrefixRequest.Builder b =
        BatchRenamePrefixRequest.newBuilder();
    parseRequestBody(exchange, b);
    BatchRenamePrefixResponse resp =
        documentService.batchRenamePrefix(userEmail, b.build());
    sendResponse(exchange, resp.getSuccess() ? 200 : 400, resp);
  }

  // Deletes single document.
  private void handleDelete(HttpExchange exchange, String userEmail)
      throws IOException {
    DeleteDocumentRequest.Builder b = DeleteDocumentRequest.newBuilder();
    parseRequestBody(exchange, b);
    DeleteDocumentResponse resp =
        documentService.deleteDocument(userEmail, b.build());
    sendResponse(exchange, resp.getSuccess() ? 200 : 400, resp);
  }

  // Deletes directory prefix.
  private void handleDeletePrefix(
      HttpExchange exchange, String userEmail) throws IOException {
    DeletePrefixRequest.Builder b = DeletePrefixRequest.newBuilder();
    parseRequestBody(exchange, b);
    DeletePrefixResponse resp =
        documentService.deletePrefix(userEmail, b.build());
    sendResponse(exchange, resp.getSuccess() ? 200 : 400, resp);
  }

  // Parses query parameters into key-value map.
  private Map<String, String> parseQuery(String query) {
    Map<String, String> map = new HashMap<>();
    if (query == null || query.isEmpty()) return map;
    for (String pair : query.split("&")) {
      int idx = pair.indexOf('=');
      if (idx > 0) {
        String key = URLDecoder.decode(
            pair.substring(0, idx), StandardCharsets.UTF_8);
        String val = URLDecoder.decode(
            pair.substring(idx + 1), StandardCharsets.UTF_8);
        map.put(key, val);
      }
    }
    return map;
  }

  // Parses request body as JSON or protobuf.
  private void parseRequestBody(
      HttpExchange exchange, Message.Builder builder) throws IOException {
    String ct = exchange.getRequestHeaders().getFirst("Content-Type");
    if (ct != null && ct.contains("application/json")) {
      String json = new String(
          exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
      JsonFormat.parser().ignoringUnknownFields().merge(json, builder);
    } else {
      builder.mergeFrom(exchange.getRequestBody());
    }
  }

  // Serializes response based on Accept header.
  private void sendResponse(HttpExchange exchange, int status, Message msg)
      throws IOException {
    String accept = exchange.getRequestHeaders().getFirst("Accept");
    if (accept != null && accept.contains("application/json")) {
      String json = JsonFormat.printer().print(msg);
      byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set(
          "Content-Type", "application/json; charset=UTF-8");
      exchange.sendResponseHeaders(status, bytes.length);
      try (OutputStream os = exchange.getResponseBody()) {
        os.write(bytes);
      }
      return;
    }
    byte[] bytes = msg.toByteArray();
    exchange.getResponseHeaders().set("Content-Type", "application/x-protobuf");
    exchange.sendResponseHeaders(status, bytes.length);
    try (OutputStream os = exchange.getResponseBody()) {
      os.write(bytes);
    }
  }

  // Authenticates session by cookie.
  private Optional<Session> authenticateRequest(HttpExchange exchange)
      throws IOException {
    String cookieHeader = exchange.getRequestHeaders().getFirst("Cookie");
    if (cookieHeader == null) return Optional.empty();
    for (String c : cookieHeader.split(";")) {
      String trimmed = c.trim();
      if (trimmed.startsWith("doki_session=")) {
        String token = trimmed.substring("doki_session=".length());
        return sessionDb.findValidSession(token, System.currentTimeMillis());
      }
    }
    return Optional.empty();
  }
}
