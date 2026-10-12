package com.doki.ultron;

import com.doki.dbs.SessionDb;
import com.doki.dbs.UserDb;
import com.doki.server.AuthHandler;
import com.doki.server.DokiHttpsServer;
import com.doki.service.AuthService;
import com.doki.workspace.dbs.WorkspaceDb;
import com.doki.workspace.server.WorkspaceHandler;
import com.doki.workspace.service.WorkspaceService;
import java.io.File;

/**
 * Main entry point for Doki / ultron server daemon.
 */
public class Main {
  private static final int DEFAULT_PORT = 5000;

  // Main method starting HTTPS server and initializing storage & routes.
  public static void main(String[] args) {
    int port = DEFAULT_PORT;
    if (args.length > 0) {
      try {
        port = Integer.parseInt(args[0]);
      } catch (NumberFormatException ignored) {}
    }

    try {
      File storageDir = new File("run/storage");
      if (!storageDir.exists()) {
        storageDir.mkdirs();
      }

      UserDb userDb = new UserDb(new File(storageDir, "users.textproto"));
      SessionDb sessionDb =
          new SessionDb(new File(storageDir, "sessions.textproto"));
      File configFile = new File("env/google_login.json");
      String clientId = "";
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

      com.doki.service.GoogleTokenVerifier tokenVerifier =
          new com.doki.service.GoogleTokenVerifier(clientId);
      AuthService authService =
          new AuthService(userDb, sessionDb, tokenVerifier);
      AuthHandler authHandler =
          new AuthHandler(authService, sessionDb, userDb, configFile);
      WorkspaceDb workspaceDb =
          new WorkspaceDb(new File(storageDir, "workspaces.textproto"));
      WorkspaceService workspaceService =
          new WorkspaceService(workspaceDb, userDb);
      WorkspaceHandler workspaceHandler =
          new WorkspaceHandler(workspaceService, sessionDb);
      com.doki.server.StaticFileHandler staticHandler =
          new com.doki.server.StaticFileHandler(new File("web"));

      DokiHttpsServer server = new DokiHttpsServer(port);
      server.createContext("/api/auth", authHandler);
      server.createContext("/api/workspaces", workspaceHandler);
      server.createContext("/", staticHandler);

      server.start();
      System.out.println("Doki HTTPS server started on port " + port);
      System.out.println("Storage directory: " + storageDir.getAbsolutePath());
    } catch (Exception e) {
      System.err.println("Failed to start server: " + e.getMessage());
      e.printStackTrace();
      System.exit(1);
    }
  }
}
