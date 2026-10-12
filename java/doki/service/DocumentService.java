package com.doki.document.service;

import com.doki.document.dbs.DocumentDb;
import com.doki.proto.document.BatchRenamePrefixRequest;
import com.doki.proto.document.BatchRenamePrefixResponse;
import com.doki.proto.document.CreateDocumentRequest;
import com.doki.proto.document.CreateDocumentResponse;
import com.doki.proto.document.DeleteDocumentRequest;
import com.doki.proto.document.DeleteDocumentResponse;
import com.doki.proto.document.DeletePrefixRequest;
import com.doki.proto.document.DeletePrefixResponse;
import com.doki.proto.document.Document;
import com.doki.proto.document.DocumentShard;
import com.doki.proto.document.DocumentSummary;
import com.doki.proto.document.GetDocumentResponse;
import com.doki.proto.document.ListDocumentsResponse;
import com.doki.proto.document.RenameDocumentRequest;
import com.doki.proto.document.RenameDocumentResponse;
import com.doki.proto.document.UpdateDocumentRequest;
import com.doki.proto.document.UpdateDocumentResponse;
import com.doki.workspace.dbs.WorkspaceDb;
import java.io.IOException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Service orchestrating document CRUD operations, shards, and virtual paths.
 */
public class DocumentService {
  private static final Pattern NO_SPACES_PATTERN =
      Pattern.compile("^[^\\s]+$");

  private final DocumentDb documentDb;
  private final WorkspaceDb workspaceDb;

  // Constructs DocumentService with document and workspace databases.
  public DocumentService(DocumentDb documentDb, WorkspaceDb workspaceDb) {
    this.documentDb = documentDb;
    this.workspaceDb = workspaceDb;
  }

  // Lists all document summaries in a workspace for an authorized user.
  public ListDocumentsResponse listDocuments(
      String userEmail, String workspaceId) throws IOException {
    if (!workspaceDb.hasAccess(workspaceId, userEmail)) {
      return ListDocumentsResponse.getDefaultInstance();
    }
    List<Document> list = documentDb.listByWorkspace(workspaceId);
    ListDocumentsResponse.Builder resp = ListDocumentsResponse.newBuilder();
    for (Document d : list) {
      resp.addDocuments(DocumentSummary.newBuilder()
          .setDocumentId(d.getDocumentId())
          .setWorkspaceId(d.getWorkspaceId())
          .setName(d.getName())
          .setShardCount(d.getShardsCount())
          .setUpdatedAtMs(d.getUpdatedAtMs())
          .build());
    }
    return resp.build();
  }

  // Retrieves full document content including shards.
  public GetDocumentResponse getDocument(
      String userEmail, String documentId) throws IOException {
    Optional<Document> docOpt = documentDb.findById(documentId);
    if (docOpt.isEmpty()) {
      return GetDocumentResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Document not found")
          .build();
    }
    Document doc = docOpt.get();
    if (!workspaceDb.hasAccess(doc.getWorkspaceId(), userEmail)) {
      return GetDocumentResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Access denied")
          .build();
    }
    return GetDocumentResponse.newBuilder()
        .setSuccess(true)
        .setDocument(doc)
        .build();
  }

  // Creates new document storing content in initial shard 0.
  public CreateDocumentResponse createDocument(
      String userEmail, CreateDocumentRequest req) throws IOException {
    String wsId = req.getWorkspaceId();
    if (!workspaceDb.hasAccess(wsId, userEmail)) {
      return CreateDocumentResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Access denied to workspace")
          .build();
    }
    String name = req.getName().trim();
    String validationErr = validateDocumentName(name);
    if (validationErr != null) {
      return CreateDocumentResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage(validationErr)
          .build();
    }
    if (documentDb.findByName(wsId, name).isPresent()) {
      return CreateDocumentResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Document with this name already exists")
          .build();
    }

    DocumentShard shard = DocumentShard.newBuilder()
        .setShardIndex(0)
        .setContent(req.getContent())
        .build();

    Document doc = Document.newBuilder()
        .setDocumentId(UUID.randomUUID().toString())
        .setWorkspaceId(wsId)
        .setName(name)
        .addShards(shard)
        .setUpdatedAtMs(System.currentTimeMillis())
        .build();

    documentDb.saveDocument(doc);
    return CreateDocumentResponse.newBuilder()
        .setSuccess(true)
        .setDocument(doc)
        .build();
  }

  // Updates full document content into shard 0.
  public UpdateDocumentResponse updateDocument(
      String userEmail, UpdateDocumentRequest req) throws IOException {
    Optional<Document> docOpt = documentDb.findById(req.getDocumentId());
    if (docOpt.isEmpty()) {
      return UpdateDocumentResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Document not found")
          .build();
    }
    Document existing = docOpt.get();
    if (!workspaceDb.hasAccess(existing.getWorkspaceId(), userEmail)) {
      return UpdateDocumentResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Access denied")
          .build();
    }

    DocumentShard shard = DocumentShard.newBuilder()
        .setShardIndex(0)
        .setContent(req.getContent())
        .build();

    Document updated = existing.toBuilder()
        .clearShards()
        .addShards(shard)
        .setUpdatedAtMs(System.currentTimeMillis())
        .build();

    documentDb.saveDocument(updated);
    return UpdateDocumentResponse.newBuilder()
        .setSuccess(true)
        .setDocument(updated)
        .build();
  }

  // Renames or moves document to new virtual path name.
  public RenameDocumentResponse renameDocument(
      String userEmail, RenameDocumentRequest req) throws IOException {
    Optional<Document> docOpt = documentDb.findById(req.getDocumentId());
    if (docOpt.isEmpty()) {
      return RenameDocumentResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Document not found")
          .build();
    }
    Document existing = docOpt.get();
    if (!workspaceDb.hasAccess(existing.getWorkspaceId(), userEmail)) {
      return RenameDocumentResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Access denied")
          .build();
    }

    String newName = req.getNewName().trim();
    String err = validateDocumentName(newName);
    if (err != null) {
      return RenameDocumentResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage(err)
          .build();
    }
    if (documentDb.findByName(existing.getWorkspaceId(), newName).isPresent()) {
      return RenameDocumentResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Target document name already exists")
          .build();
    }

    Document updated = existing.toBuilder()
        .setName(newName)
        .setUpdatedAtMs(System.currentTimeMillis())
        .build();
    documentDb.saveDocument(updated);

    return RenameDocumentResponse.newBuilder()
        .setSuccess(true)
        .setDocument(updated)
        .build();
  }

  // Batch renames directory path prefix for all nested documents.
  public BatchRenamePrefixResponse batchRenamePrefix(
      String userEmail, BatchRenamePrefixRequest req) throws IOException {
    if (!workspaceDb.hasAccess(req.getWorkspaceId(), userEmail)) {
      return BatchRenamePrefixResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Access denied")
          .build();
    }
    String oldPrefix = req.getOldPrefix().trim();
    String newPrefix = req.getNewPrefix().trim();
    if (!NO_SPACES_PATTERN.matcher(newPrefix).matches()) {
      return BatchRenamePrefixResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Directory path cannot contain spaces")
          .build();
    }
    int count = documentDb.batchRenamePrefix(
        req.getWorkspaceId(), oldPrefix, newPrefix);
    return BatchRenamePrefixResponse.newBuilder()
        .setSuccess(true)
        .setModifiedCount(count)
        .build();
  }

  // Deletes single document by its document ID.
  public DeleteDocumentResponse deleteDocument(
      String userEmail, DeleteDocumentRequest req) throws IOException {
    Optional<Document> docOpt = documentDb.findById(req.getDocumentId());
    if (docOpt.isEmpty()) {
      return DeleteDocumentResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Document not found")
          .build();
    }
    Document doc = docOpt.get();
    if (!workspaceDb.hasAccess(doc.getWorkspaceId(), userEmail)) {
      return DeleteDocumentResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Access denied")
          .build();
    }
    documentDb.removeDocument(req.getDocumentId());
    return DeleteDocumentResponse.newBuilder()
        .setSuccess(true)
        .build();
  }

  // Deletes all documents under a directory prefix.
  public DeletePrefixResponse deletePrefix(
      String userEmail, DeletePrefixRequest req) throws IOException {
    if (!workspaceDb.hasAccess(req.getWorkspaceId(), userEmail)) {
      return DeletePrefixResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Access denied")
          .build();
    }
    int count = documentDb.removeByPrefix(
        req.getWorkspaceId(), req.getPrefix().trim());
    return DeletePrefixResponse.newBuilder()
        .setSuccess(true)
        .setDeletedCount(count)
        .build();
  }

  // Validates virtual document path name enforcing no spaces.
  private String validateDocumentName(String name) {
    if (name.isEmpty()) return "Document name cannot be empty";
    if (!NO_SPACES_PATTERN.matcher(name).matches()) {
      return "Document name cannot contain spaces";
    }
    if (name.startsWith("/") || name.endsWith("/")) {
      return "Document name cannot start or end with slash";
    }
    if (name.contains("//")) {
      return "Document name cannot contain consecutive slashes";
    }
    return null;
  }
}
