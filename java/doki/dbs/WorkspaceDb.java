package com.doki.workspace.dbs;

import com.doki.proto.workspace.Workspace;
import com.doki.proto.workspace.WorkspaceDatabase;
import com.google.protobuf.TextFormat;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Storage accessor for workspaces.textproto database.
 */
public class WorkspaceDb {
  private final File dbFile;

  // Initializes workspace database wrapper with target textproto path.
  public WorkspaceDb(File dbFile) {
    this.dbFile = dbFile;
  }

  // Reads and parses workspace database from disk.
  public synchronized WorkspaceDatabase readDatabase() throws IOException {
    if (!dbFile.exists()) {
      return WorkspaceDatabase.getDefaultInstance();
    }
    String content = Files.readString(dbFile.toPath());
    WorkspaceDatabase.Builder builder = WorkspaceDatabase.newBuilder();
    TextFormat.merge(content, builder);
    return builder.build();
  }

  // Writes entire workspace database to disk in textproto format.
  public synchronized void writeDatabase(WorkspaceDatabase db)
      throws IOException {
    File parent = dbFile.getParentFile();
    if (parent != null && !parent.exists()) {
      parent.mkdirs();
    }
    String content = TextFormat.printer().printToString(db);
    Files.writeString(dbFile.toPath(), content);
  }

  // Finds workspace by its unique ID.
  public synchronized Optional<Workspace> findById(String id)
      throws IOException {
    WorkspaceDatabase db = readDatabase();
    for (Workspace ws : db.getWorkspacesList()) {
      if (ws.getWorkspaceId().equals(id)) {
        return Optional.of(ws);
      }
    }
    return Optional.empty();
  }

  // Lists all workspaces accessible by user email (owner or collaborator).
  public synchronized List<Workspace> listAccessibleByUser(String email)
      throws IOException {
    List<Workspace> result = new ArrayList<>();
    WorkspaceDatabase db = readDatabase();
    for (Workspace ws : db.getWorkspacesList()) {
      if (ws.getOwnerEmail().equalsIgnoreCase(email) ||
          ws.getCollaboratorEmailsList().stream()
              .anyMatch(c -> c.equalsIgnoreCase(email))) {
        result.add(ws);
      }
    }
    return result;
  }

  // Counts how many workspaces are owned by given user email.
  public synchronized int countOwnedByUser(String email) throws IOException {
    int count = 0;
    WorkspaceDatabase db = readDatabase();
    for (Workspace ws : db.getWorkspacesList()) {
      if (ws.getOwnerEmail().equalsIgnoreCase(email)) {
        count++;
      }
    }
    return count;
  }

  // Saves or updates a workspace in the database.
  public synchronized void saveWorkspace(Workspace workspace)
      throws IOException {
    WorkspaceDatabase db = readDatabase();
    List<Workspace> list = new ArrayList<>();
    boolean updated = false;
    for (Workspace ws : db.getWorkspacesList()) {
      if (ws.getWorkspaceId().equals(workspace.getWorkspaceId())) {
        list.add(workspace);
        updated = true;
      } else {
        list.add(ws);
      }
    }
    if (!updated) {
      list.add(workspace);
    }
    writeDatabase(WorkspaceDatabase.newBuilder().addAllWorkspaces(list).build());
  }

  // Deletes workspace matching the given ID.
  public synchronized void deleteWorkspace(String id) throws IOException {
    WorkspaceDatabase db = readDatabase();
    List<Workspace> list = new ArrayList<>();
    for (Workspace ws : db.getWorkspacesList()) {
      if (!ws.getWorkspaceId().equals(id)) {
        list.add(ws);
      }
    }
    writeDatabase(WorkspaceDatabase.newBuilder().addAllWorkspaces(list).build());
  }
}
