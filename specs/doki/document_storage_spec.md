# Document Storage Specification

## 1. Overview
The **Document** is the primary organizational unit in Doki. Each document
belongs to a single workspace, possesses a unique path name, and contains
content structured as a sequence of **`DocumentShard`** objects.

Directories are **virtual paths** embedded directly inside the document's
name (e.g. `notes/project/spec.md`). The backend persists documents in a flat
key-value/relational style without storing explicit directory entities.

---

## 2. Document Data Model & Constraints

### 2.1 Entity Structure
Each document record contains:
- `document_id`: Standard UUID string
  (e.g. `b4f8a3d1-93e2-4521-8f23-8cfb62e4a1a9`).
- `workspace_id`: Standard UUID of the owning workspace.
- `name`: Virtual file path relative to workspace root
  (e.g. `src/main.py` or `readme.md`).
  - **No spaces allowed**: Must match regex `^[^\s]+$`.
  - Path segments are separated by forward slashes (`/`).
  - Cannot start or end with `/`. Cannot contain duplicate slashes (`//`).
- `shards`: Ordered list of `DocumentShard` messages representing
  document parts.
- `updated_at_ms`: Epoch millisecond timestamp of last update.

### 2.2 Document Shards (`DocumentShard`)
Documents are partitioned into shards:
- `shard_index`: Integer index defining the sequence order (0, 1, 2, ...).
- `content`: Text content of the shard.

> [!NOTE]
> The document editor transmits the full string content of the document to
> the backend, which stores it in the **first shard (`shard_index = 0`)**.

### 2.3 Directory Lifecycle & Constraints
1. **Virtual Directories**:
   - Directories are derived solely from document name paths
     (e.g. `docs/api/index.md`).
   - The backend does not store standalone directory entities.
2. **Empty Directory Ephemerality**:
   - Directories created on the UI without any file in them exist only in UI
     memory. Upon page refresh or workspace reload, empty directories are
     discarded automatically.
3. **Removal of Directories**:
   - Removal of empty directories is allowed and happens automatically in UI
     memory.
   - Removing a non-empty directory deletes all documents residing under that
     directory prefix in the backend.
4. **Moving & Renaming**:
   - **File Rename**: Updates `name` (e.g. `docs/old.md` -> `docs/new.md`).
   - **File Move**: Updates directory prefix in `name`
     (e.g. `docs/file.md` -> `archive/file.md`).
   - **Directory Rename / Move**: Batch updates the path prefix for all
     documents belonging to the directory (e.g. `old_dir/*` -> `new_dir/*`).

---

## 3. Storage Schema (Textproto)

Persisted in `run/storage/documents.textproto`.

### 3.1 Protobuf Definition (`proto/doki/document.proto`)
```proto
syntax = "proto3";

package doki.document;

option java_package = "com.doki.proto.document";
option java_multiple_files = true;

message DocumentShard {
  int32 shard_index = 1;
  string content = 2;
}

message Document {
  string document_id = 1;
  string workspace_id = 2;
  string name = 3;
  repeated DocumentShard shards = 4;
  int64 updated_at_ms = 5;
}

message DocumentDatabase {
  repeated Document documents = 1;
}
```

### 3.2 Storage Example
```textproto
documents {
  document_id: "b4f8a3d1-93e2-4521-8f23-8cfb62e4a1a9"
  workspace_id: "487db7ab-d668-4cb1-9b15-2d42e2088950"
  name: "notes/todo.md"
  shards {
    shard_index: 0
    content: "# Tasks\n- Implement document shards\n- Add tree tile"
  }
  updated_at_ms: 1718000000000
}
```

---

## 4. API Endpoints (HTTPS REST over Proto/JSON)

All endpoints require an active session (`doki_session` cookie) and verify that
the user has access (as owner or collaborator) to the specified `workspace_id`.

### 4.1 List Documents in Workspace
- **Path**: `GET /api/documents?workspace_id={workspaceId}`
- Returns document summaries without full shard bodies.
- Response:
  ```proto
  message DocumentSummary {
    string document_id = 1;
    string workspace_id = 2;
    string name = 3;
    int32 shard_count = 4;
    int64 updated_at_ms = 5;
  }

  message ListDocumentsResponse {
    repeated DocumentSummary documents = 1;
  }
  ```

### 4.2 Get Document (Full Content)
- **Path**: `GET /api/documents/get?document_id={documentId}`
- Response:
  ```proto
  message GetDocumentResponse {
    bool success = 1;
    string error_message = 2;
    Document document = 3;
  }
  ```

### 4.3 Create Document
- **Path**: `POST /api/documents`
- Validates:
  - User has access to `workspace_id`.
  - `name` contains **no spaces** and does not already exist in the workspace.
  - Full string content is stored in shard 0.
- Request:
  ```proto
  message CreateDocumentRequest {
    string workspace_id = 1;
    string name = 2;
    string content = 3;
  }
  ```
- Response:
  ```proto
  message CreateDocumentResponse {
    bool success = 1;
    string error_message = 2;
    Document document = 3;
  }
  ```

### 4.4 Update Document Content
- **Path**: `POST /api/documents/update`
- Transmits new full string content, persisted into shard 0.
- Request:
  ```proto
  message UpdateDocumentRequest {
    string document_id = 1;
    string content = 2;
  }
  ```
- Response:
  ```proto
  message UpdateDocumentResponse {
    bool success = 1;
    string error_message = 2;
    Document document = 3;
  }
  ```

### 4.5 Rename / Move Document
- **Path**: `POST /api/documents/rename`
- Changes the virtual name/path of a single document.
- Request:
  ```proto
  message RenameDocumentRequest {
    string document_id = 1;
    string new_name = 2;
  }
  ```
- Response:
  ```proto
  message RenameDocumentResponse {
    bool success = 1;
    string error_message = 2;
    Document document = 3;
  }
  ```

### 4.6 Batch Rename (Move or Rename Directory)
- **Path**: `POST /api/documents/batch_rename_prefix`
- Updates all documents starting with `old_prefix/` to `new_prefix/`.
- Request:
  ```proto
  message BatchRenamePrefixRequest {
    string workspace_id = 1;
    string old_prefix = 2;
    string new_prefix = 3;
  }
  ```
- Response:
  ```proto
  message BatchRenamePrefixResponse {
    bool success = 1;
    string error_message = 2;
    int32 modified_count = 3;
  }
  ```

### 4.7 Delete Document
- **Path**: `POST /api/documents/delete`
- Request:
  ```proto
  message DeleteDocumentRequest {
    string document_id = 1;
  }
  ```
- Response:
  ```proto
  message DeleteDocumentResponse {
    bool success = 1;
    string error_message = 2;
  }
  ```

### 4.8 Delete Directory Prefix (Trash Non-Empty Directory)
- **Path**: `POST /api/documents/delete_prefix`
- Deletes all documents under a given directory prefix.
- Request:
  ```proto
  message DeletePrefixRequest {
    string workspace_id = 1;
    string prefix = 2;
  }
  ```
- Response:
  ```proto
  message DeletePrefixResponse {
    bool success = 1;
    string error_message = 2;
    int32 deleted_count = 3;
  }
  ```
