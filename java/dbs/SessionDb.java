package com.doki.dbs;

import com.doki.proto.auth.Session;
import com.doki.proto.auth.SessionDatabase;
import com.google.protobuf.TextFormat;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Storage accessor for sessions.textproto database.
 */
public class SessionDb {
  private final File dbFile;

  // Initializes session database wrapper with target textproto path.
  public SessionDb(File dbFile) {
    this.dbFile = dbFile;
  }

  // Reads and parses session database from disk.
  public synchronized SessionDatabase readDatabase() throws IOException {
    if (!dbFile.exists()) {
      return SessionDatabase.getDefaultInstance();
    }
    String content = Files.readString(dbFile.toPath());
    SessionDatabase.Builder builder = SessionDatabase.newBuilder();
    TextFormat.merge(content, builder);
    return builder.build();
  }

  // Writes entire session database to disk in textproto format.
  public synchronized void writeDatabase(SessionDatabase db)
      throws IOException {
    File parent = dbFile.getParentFile();
    if (parent != null && !parent.exists()) {
      parent.mkdirs();
    }
    String content = TextFormat.printer().printToString(db);
    Files.writeString(dbFile.toPath(), content);
  }

  // Finds unexpired session by token by sequentially iterating records.
  public synchronized Optional<Session> findValidSession(
      String token, long nowMs) throws IOException {
    SessionDatabase db = readDatabase();
    for (Session s : db.getSessionsList()) {
      if (s.getSessionToken().equals(token) && s.getExpiresAtMs() > nowMs) {
        return Optional.of(s);
      }
    }
    return Optional.empty();
  }

  // Saves or updates a session entry in the database.
  public synchronized void saveSession(Session session) throws IOException {
    SessionDatabase db = readDatabase();
    List<Session> list = new ArrayList<>();
    for (Session s : db.getSessionsList()) {
      if (!s.getSessionToken().equals(session.getSessionToken())) {
        list.add(s);
      }
    }
    list.add(session);
    writeDatabase(SessionDatabase.newBuilder().addAllSessions(list).build());
  }

  // Removes session matching the given token from storage.
  public synchronized void removeSession(String token) throws IOException {
    SessionDatabase db = readDatabase();
    List<Session> list = new ArrayList<>();
    for (Session s : db.getSessionsList()) {
      if (!s.getSessionToken().equals(token)) {
        list.add(s);
      }
    }
    writeDatabase(SessionDatabase.newBuilder().addAllSessions(list).build());
  }
}
