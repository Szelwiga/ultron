package com.doki.workspace.server;

import com.doki.dbs.SessionDb;
import com.doki.proto.auth.Session;
import com.doki.proto.workspace.CreateWorkspaceRequest;
import com.doki.proto.workspace.CreateWorkspaceResponse;
import com.doki.proto.workspace.DeleteWorkspaceRequest;
import com.doki.proto.workspace.DeleteWorkspaceResponse;
import com.doki.proto.workspace.ListWorkspacesResponse;
import com.doki.proto.workspace.ManageCollaboratorRequest;
import com.doki.proto.workspace.ManageCollaboratorResponse;
import com.doki.proto.workspace.UpdateWorkspaceRequest;
import com.doki.proto.workspace.UpdateWorkspaceResponse;
import com.doki.workspace.service.WorkspaceService;
import com.google.protobuf.Message;
import com.google.protobuf.util.JsonFormat;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Optional;

/**
 * HTTP handler routing /api/workspaces/* endpoints.
 */
public class WorkspaceHandler implements HttpHandler {
  private final WorkspaceService workspaceService;
  private final SessionDb sessionDb;

  // Constructs WorkspaceHandler with service and session database.
  public WorkspaceHandler(
      WorkspaceService workspaceService, SessionDb sessionDb) {
    this.workspaceService = workspaceService;
    this.sessionDb = sessionDb;
  }

  // Dispatches incoming request to matching workspace action.
  @Override
  public void handle(HttpExchange exchange) throws IOException {
    Optional<Session> sessionOpt = authenticateRequest(exchange);
    if (sessionOpt.isEmpty()) {
      exchange.sendResponseHeaders(401, -1);
      return;
    }

    String userEmail = sessionOpt.get().getUserId();
    workspaceService.ensureDefaultWorkspace(userEmail);

    String path = exchange.getRequestURI().getPath();
    String method = exchange.getRequestMethod();

    if ("/api/workspaces".equals(path) && "GET".equalsIgnoreCase(method)) {
      handleList(exchange, userEmail);
    } else if ("/api/workspaces".equals(path) &&
               "POST".equalsIgnoreCase(method)) {
      handleCreate(exchange, userEmail);
    } else if ("/api/workspaces/update".equals(path) &&
               "POST".equalsIgnoreCase(method)) {
      handleUpdate(exchange, userEmail);
    } else if ("/api/workspaces/collaborators".equals(path) &&
               "POST".equalsIgnoreCase(method)) {
      handleManageCollaborators(exchange, userEmail);
    } else if ("/api/workspaces/delete".equals(path) &&
               "POST".equalsIgnoreCase(method)) {
      handleDelete(exchange, userEmail);
    } else {
      exchange.sendResponseHeaders(404, -1);
    }
  }

  // Lists all workspaces accessible to user.
  private void handleList(HttpExchange exchange, String userEmail)
      throws IOException {
    ListWorkspacesResponse resp = workspaceService.listWorkspaces(userEmail);
    sendResponse(exchange, 200, resp);
  }

  // Creates new workspace.
  private void handleCreate(HttpExchange exchange, String userEmail)
      throws IOException {
    CreateWorkspaceRequest.Builder b = CreateWorkspaceRequest.newBuilder();
    parseRequestBody(exchange, b);
    CreateWorkspaceResponse resp =
        workspaceService.createWorkspace(userEmail, b.build());
    sendResponse(exchange, resp.getSuccess() ? 200 : 400, resp);
  }

  // Updates workspace name/description.
  private void handleUpdate(HttpExchange exchange, String userEmail)
      throws IOException {
    UpdateWorkspaceRequest.Builder b = UpdateWorkspaceRequest.newBuilder();
    parseRequestBody(exchange, b);
    UpdateWorkspaceResponse resp =
        workspaceService.updateWorkspace(userEmail, b.build());
    sendResponse(exchange, resp.getSuccess() ? 200 : 400, resp);
  }

  // Manages collaborators.
  private void handleManageCollaborators(
      HttpExchange exchange, String userEmail) throws IOException {
    ManageCollaboratorRequest.Builder b =
        ManageCollaboratorRequest.newBuilder();
    parseRequestBody(exchange, b);
    ManageCollaboratorResponse resp =
        workspaceService.manageCollaborator(userEmail, b.build());
    sendResponse(exchange, resp.getSuccess() ? 200 : 400, resp);
  }

  // Deletes workspace.
  private void handleDelete(HttpExchange exchange, String userEmail)
      throws IOException {
    DeleteWorkspaceRequest.Builder b = DeleteWorkspaceRequest.newBuilder();
    parseRequestBody(exchange, b);
    DeleteWorkspaceResponse resp =
        workspaceService.deleteWorkspace(userEmail, b.build());
    sendResponse(exchange, resp.getSuccess() ? 200 : 400, resp);
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
