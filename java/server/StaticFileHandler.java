package com.doki.server;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Serves static web frontend assets from the web/ directory.
 */
public class StaticFileHandler implements HttpHandler {
  private final File webRoot;

  // Initializes static file handler pointing to the frontend root folder.
  public StaticFileHandler(File webRoot) {
    this.webRoot = webRoot;
  }

  // Handles incoming HTTP requests for static assets and fallback index.
  @Override
  public void handle(HttpExchange exchange) throws IOException {
    String method = exchange.getRequestMethod();
    if (!"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method)) {
      exchange.sendResponseHeaders(405, -1);
      return;
    }

    String path = exchange.getRequestURI().getPath();
    File target = resolveFile(path);

    if (target == null || !target.exists() || target.isDirectory()) {
      target = new File(webRoot, "login/index.html");
      if (!target.exists()) {
        target = new File(webRoot, "index.html");
      }
    }

    if (!target.exists() || !target.isFile()) {
      byte[] notFound = "Not Found".getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set("Content-Type", "text/plain");
      exchange.sendResponseHeaders(404, notFound.length);
      try (OutputStream os = exchange.getResponseBody()) {
        os.write(notFound);
      }
      return;
    }

    String mime = getContentType(target.getName());
    exchange.getResponseHeaders().set("Content-Type", mime);
    exchange.sendResponseHeaders(200, target.length());

    if ("GET".equalsIgnoreCase(method)) {
      try (FileInputStream fis = new FileInputStream(target);
           OutputStream os = exchange.getResponseBody()) {
        fis.transferTo(os);
      }
    }
  }

  // Resolves requested relative path ensuring it stays within web root.
  private File resolveFile(String path) {
    if (path == null || path.equals("/") || path.isBlank()) {
      return new File(webRoot, "login/index.html");
    }
    String cleanPath = path.startsWith("/") ? path.substring(1) : path;
    File file = new File(webRoot, cleanPath);
    try {
      if (file.getCanonicalPath().startsWith(webRoot.getCanonicalPath())) {
        return file;
      }
    } catch (IOException e) {
      return null;
    }
    return null;
  }

  // Determines MIME type based on file extension.
  private String getContentType(String name) {
    if (name.endsWith(".html")) return "text/html; charset=UTF-8";
    if (name.endsWith(".js")) return "application/javascript; charset=UTF-8";
    if (name.endsWith(".css")) return "text/css; charset=UTF-8";
    if (name.endsWith(".json")) return "application/json; charset=UTF-8";
    if (name.endsWith(".svg")) return "image/svg+xml";
    if (name.endsWith(".png")) return "image/png";
    return "application/octet-stream";
  }
}
