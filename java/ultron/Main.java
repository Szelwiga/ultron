package com.doki.ultron;

import com.doki.dbs.SessionDb;
import com.doki.dbs.UserDb;
import com.doki.server.AuthHandler;
import com.doki.server.DokiHttpsServer;
import com.doki.service.AuthService;
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
      AuthService authService = new AuthService(userDb, sessionDb);
      AuthHandler authHandler =
          new AuthHandler(authService, sessionDb, userDb);
      com.doki.server.StaticFileHandler staticHandler =
          new com.doki.server.StaticFileHandler(new File("web"));

      DokiHttpsServer server = new DokiHttpsServer(port);
      server.createContext("/api/auth", authHandler);
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
