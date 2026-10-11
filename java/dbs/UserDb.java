package com.doki.dbs;

import com.doki.proto.auth.User;
import com.doki.proto.auth.UserDatabase;
import com.google.protobuf.TextFormat;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Storage accessor for users.textproto database.
 */
public class UserDb {
  private final File dbFile;

  // Initializes user database wrapper with target textproto path.
  public UserDb(File dbFile) {
    this.dbFile = dbFile;
  }

  // Reads and parses user database from disk.
  public synchronized UserDatabase readDatabase() throws IOException {
    if (!dbFile.exists()) {
      return UserDatabase.getDefaultInstance();
    }
    String content = Files.readString(dbFile.toPath());
    UserDatabase.Builder builder = UserDatabase.newBuilder();
    TextFormat.merge(content, builder);
    return builder.build();
  }

  // Writes entire user database to disk in textproto format.
  public synchronized void writeDatabase(UserDatabase db) throws IOException {
    File parent = dbFile.getParentFile();
    if (parent != null && !parent.exists()) {
      parent.mkdirs();
    }
    String content = TextFormat.printer().printToString(db);
    Files.writeString(dbFile.toPath(), content);
  }

  // Finds user by Google subject ID by sequentially scanning records.
  public synchronized Optional<User> findByGoogleId(String googleId)
      throws IOException {
    UserDatabase db = readDatabase();
    for (User u : db.getUsersList()) {
      if (u.getGoogleId().equals(googleId)) {
        return Optional.of(u);
      }
    }
    return Optional.empty();
  }

  // Finds user by unique tag (the part after #) sequentially.
  public synchronized Optional<User> findByTag(String tag)
      throws IOException {
    UserDatabase db = readDatabase();
    for (User u : db.getUsersList()) {
      String t = extractTag(u.getUsername());
      if (t.equals(tag)) {
        return Optional.of(u);
      }
    }
    return Optional.empty();
  }

  // Saves a new user or updates an existing user matched by tag.
  public synchronized void saveUser(User user) throws IOException {
    UserDatabase db = readDatabase();
    List<User> list = new ArrayList<>();
    String targetTag = extractTag(user.getUsername());
    boolean updated = false;
    for (User u : db.getUsersList()) {
      if (extractTag(u.getUsername()).equals(targetTag)) {
        list.add(user);
        updated = true;
      } else {
        list.add(u);
      }
    }
    if (!updated) {
      list.add(user);
    }
    writeDatabase(UserDatabase.newBuilder().addAllUsers(list).build());
  }

  // Extracts tag portion after the '#' character.
  public static String extractTag(String username) {
    int idx = username.indexOf('#');
    return idx >= 0 ? username.substring(idx + 1) : username;
  }

  // Extracts name portion before the '#' character.
  public static String extractName(String username) {
    int idx = username.indexOf('#');
    return idx >= 0 ? username.substring(0, idx) : username;
  }
}
