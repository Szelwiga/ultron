package com.doki.document.dbs;

import com.doki.proto.document.Document;
import com.doki.proto.document.DocumentDatabase;
import com.google.protobuf.TextFormat;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Storage accessor for documents.textproto database.
 */
public class DocumentDb {
  private final File dbFile;

  // Initializes document database wrapper with target textproto path.
  public DocumentDb(File dbFile) {
    this.dbFile = dbFile;
  }

  // Reads and parses document database from disk.
  public synchronized DocumentDatabase readDatabase() throws IOException {
    if (!dbFile.exists()) {
      return DocumentDatabase.getDefaultInstance();
    }
    String content = Files.readString(dbFile.toPath());
    DocumentDatabase.Builder builder = DocumentDatabase.newBuilder();
    TextFormat.merge(content, builder);
    return builder.build();
  }

  // Writes entire document database to disk in textproto format.
  public synchronized void writeDatabase(DocumentDatabase db)
      throws IOException {
    File parent = dbFile.getParentFile();
    if (parent != null && !parent.exists()) {
      parent.mkdirs();
    }
    String content = TextFormat.printer().printToString(db);
    Files.writeString(dbFile.toPath(), content);
  }

  // Finds document by unique document ID.
  public synchronized Optional<Document> findById(String id)
      throws IOException {
    DocumentDatabase db = readDatabase();
    for (Document d : db.getDocumentsList()) {
      if (d.getDocumentId().equals(id)) {
        return Optional.of(d);
      }
    }
    return Optional.empty();
  }

  // Finds document in a workspace by its exact virtual path name.
  public synchronized Optional<Document> findByName(
      String workspaceId, String name) throws IOException {
    DocumentDatabase db = readDatabase();
    for (Document d : db.getDocumentsList()) {
      if (d.getWorkspaceId().equals(workspaceId) &&
          d.getName().equals(name)) {
        return Optional.of(d);
      }
    }
    return Optional.empty();
  }

  // Lists all documents belonging to a workspace.
  public synchronized List<Document> listByWorkspace(String workspaceId)
      throws IOException {
    DocumentDatabase db = readDatabase();
    List<Document> result = new ArrayList<>();
    for (Document d : db.getDocumentsList()) {
      if (d.getWorkspaceId().equals(workspaceId)) {
        result.add(d);
      }
    }
    return result;
  }

  // Saves or updates document record in storage.
  public synchronized void saveDocument(Document doc) throws IOException {
    DocumentDatabase db = readDatabase();
    List<Document> list = new ArrayList<>();
    for (Document d : db.getDocumentsList()) {
      if (!d.getDocumentId().equals(doc.getDocumentId())) {
        list.add(d);
      }
    }
    list.add(doc);
    writeDatabase(DocumentDatabase.newBuilder().addAllDocuments(list).build());
  }

  // Removes document matching ID from storage.
  public synchronized boolean removeDocument(String documentId)
      throws IOException {
    DocumentDatabase db = readDatabase();
    List<Document> list = new ArrayList<>();
    boolean found = false;
    for (Document d : db.getDocumentsList()) {
      if (!d.getDocumentId().equals(documentId)) {
        list.add(d);
      } else {
        found = true;
      }
    }
    if (found) {
      writeDatabase(
          DocumentDatabase.newBuilder().addAllDocuments(list).build());
    }
    return found;
  }

  // Batch renames document path prefixes for directory move/rename.
  public synchronized int batchRenamePrefix(
      String workspaceId, String oldPrefix, String newPrefix)
      throws IOException {
    DocumentDatabase db = readDatabase();
    List<Document> list = new ArrayList<>();
    int count = 0;
    String prefixWithSlash = oldPrefix.endsWith("/")
        ? oldPrefix : oldPrefix + "/";
    String targetPrefix = newPrefix.endsWith("/")
        ? newPrefix : (newPrefix.isEmpty() ? "" : newPrefix + "/");

    for (Document d : db.getDocumentsList()) {
      if (d.getWorkspaceId().equals(workspaceId) &&
          d.getName().startsWith(prefixWithSlash)) {
        String sub = d.getName().substring(prefixWithSlash.length());
        String renamed = targetPrefix + sub;
        list.add(d.toBuilder().setName(renamed).build());
        count++;
      } else {
        list.add(d);
      }
    }
    if (count > 0) {
      writeDatabase(
          DocumentDatabase.newBuilder().addAllDocuments(list).build());
    }
    return count;
  }

  // Removes all documents starting with prefix in a workspace.
  public synchronized int removeByPrefix(
      String workspaceId, String prefix) throws IOException {
    DocumentDatabase db = readDatabase();
    List<Document> list = new ArrayList<>();
    int count = 0;
    String prefixWithSlash = prefix.endsWith("/") ? prefix : prefix + "/";

    for (Document d : db.getDocumentsList()) {
      if (d.getWorkspaceId().equals(workspaceId) &&
          (d.getName().equals(prefix) ||
           d.getName().startsWith(prefixWithSlash))) {
        count++;
      } else {
        list.add(d);
      }
    }
    if (count > 0) {
      writeDatabase(
          DocumentDatabase.newBuilder().addAllDocuments(list).build());
    }
    return count;
  }
}
