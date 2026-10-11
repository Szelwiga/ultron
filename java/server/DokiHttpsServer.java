package com.doki.server;

import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsParameters;
import com.sun.net.httpserver.HttpsServer;
import java.io.File;
import java.io.FileInputStream;
import java.net.InetSocketAddress;
import java.security.KeyStore;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;

/**
 * HTTPS server wrapper with SSLContext configuration.
 */
public class DokiHttpsServer {
  private final int port;
  private final HttpsServer server;

  // Initializes HTTPS server on the specified port.
  public DokiHttpsServer(int port) throws Exception {
    this.port = port;
    this.server = HttpsServer.create(new InetSocketAddress(port), 0);
    SSLContext sslContext = createSSLContext();
    this.server.setHttpsConfigurator(new HttpsConfigurator(sslContext) {
      @Override
      public void configure(HttpsParameters params) {
        try {
          SSLContext c = getSSLContext();
          SSLParameters p = c.getDefaultSSLParameters();
          params.setSSLParameters(p);
        } catch (Exception ex) {
          params.setCipherSuites(null);
        }
      }
    });
  }

  // Registers handler for given context path.
  public void createContext(
      String path, com.sun.net.httpserver.HttpHandler handler) {
    server.createContext(path, handler);
  }

  // Starts the HTTPS server.
  public void start() {
    server.start();
  }

  // Stops the HTTPS server with delay seconds.
  public void stop(int delay) {
    server.stop(delay);
  }

  // Returns underlying port.
  public int getPort() {
    return port;
  }

  // Creates SSLContext loading or generating keystore.
  private SSLContext createSSLContext() throws Exception {
    char[] password = "dokipassword".toCharArray();
    File keystoreFile = new File("run/keystore.jks");

    if (!keystoreFile.exists()) {
      ensureKeystore(keystoreFile, password);
    }

    KeyStore ks = KeyStore.getInstance("JKS");
    try (FileInputStream fis = new FileInputStream(keystoreFile)) {
      ks.load(fis, password);
    }

    KeyManagerFactory kmf = KeyManagerFactory.getInstance(
        KeyManagerFactory.getDefaultAlgorithm());
    kmf.init(ks, password);
    SSLContext sslContext = SSLContext.getInstance("TLS");
    sslContext.init(kmf.getKeyManagers(), null, null);
    return sslContext;
  }

  // Invokes keytool to generate self-signed keystore if missing.
  private void ensureKeystore(File keystoreFile, char[] password)
      throws Exception {
    File parent = keystoreFile.getParentFile();
    if (parent != null) parent.mkdirs();

    ProcessBuilder pb = new ProcessBuilder(
        "keytool", "-genkeypair",
        "-alias", "doki",
        "-keyalg", "RSA",
        "-keysize", "2048",
        "-validity", "365",
        "-keystore", keystoreFile.getAbsolutePath(),
        "-storepass", new String(password),
        "-keypass", new String(password),
        "-dname", "CN=localhost, OU=Doki, O=Doki, L=City, S=State, C=US"
    );
    Process p = pb.start();
    int exit = p.waitFor();
    if (exit != 0) {
      throw new IllegalStateException("Failed to generate keystore via keytool");
    }
  }
}
