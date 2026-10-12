# Workspaces Specification

## 1. Overview
A **Workspace** is an isolated collaboration environment for documents and
agent chats. Users can create, configure, switch between, and collaborate on
workspaces. Workspaces are configured and managed within the **Settings tile**
(full-canvas view) and switched via a dropdown menu in the top-left corner of
the top navigation bar.

---

## 2. Workspace Data Model & Constraints

### 2.1 Entity Structure
Each workspace record contains:
- `workspace_id`: Standard UUID string (e.g. `487db7ab-d668-4cb1-9b15-2d42e2088950`).
- `name`: Human-readable name (1–64 characters).
- `description`: Optional text description (up to 256 characters).
- `owner_email`: Email of the workspace creator/owner.
- `collaborator_emails`: List of collaborator user emails who have access.
- `is_personal`: Boolean indicating whether this is the undeletable Personal
  workspace.

### 2.2 Ownership & Access Rules
1. **Ownership Limit**: A single user may own up to **10 workspaces** at any
   time. Attempts to create an 11th workspace return a validation error.
2. **Access Rights**:
   - A user has access to a workspace if their email matches `owner_email` or
     is in `collaborator_emails`.
   - Only the **owner** can edit workspace name/description, add or remove
     collaborators, or delete the workspace.
3. **Personal Workspace (Default)**:
   > [!IMPORTANT]
   > - Upon user registration, a default workspace named **`Personal`** is
   >   automatically created (`is_personal = true`).
   > - The `Personal` workspace **cannot be deleted or removed** by the user.
   > - On the UI, it displays a distinct `Personal` badge and its delete button
   >   is disabled/hidden.
4. **Collaborator Management Rules**:
   - Before adding a collaborator, the backend validates that the target email
     belongs to an **existing registered user** in `users.textproto`.
   - The **workspace owner cannot be added** as a collaborator to their own
     workspace.

---

## 3. Storage Schema (Textproto)

Workspaces are persisted in `run/storage/workspaces.textproto`.

### 3.1 Protobuf Definition (`proto/workspace.proto`)
```proto
syntax = "proto3";

package doki.workspace;

option java_package = "com.doki.proto.workspace";
option java_multiple_files = true;

message Workspace {
  string workspace_id = 1;
  string name = 2;
  string description = 3;
  string owner_email = 4;
  repeated string collaborator_emails = 5;
  bool is_personal = 6;
}

message WorkspaceDatabase {
  repeated Workspace workspaces = 1;
}
```

Example in `run/storage/workspaces.textproto`:
```textproto
workspaces {
  workspace_id: "487db7ab-d668-4cb1-9b15-2d42e2088950"
  name: "Research & Design"
  description: "Doki design specs and documentation"
  owner_email: "alice@example.com"
  collaborator_emails: "bob@example.com"
  collaborator_emails: "carol@example.com"
}
```

---

## 4. API Endpoints (HTTPS REST over Proto/JSON)

All workspace endpoints require an authenticated session (`doki_session` cookie).

### 4.1 List Workspaces
- **Path**: `GET /api/workspaces`
- Returns all workspaces where the authenticated user is either the owner or a
  collaborator.
- Response:
  ```proto
  message ListWorkspacesResponse {
    repeated Workspace workspaces = 1;
  }
  ```

### 4.2 Create Workspace
- **Path**: `POST /api/workspaces`
- Validates that the authenticated user currently owns < 10 workspaces.
- Request:
  ```proto
  message CreateWorkspaceRequest {
    string name = 1;
    string description = 2;
  }
  ```
- Response:
  ```proto
  message CreateWorkspaceResponse {
    bool success = 1;
    string error_message = 2;
    Workspace workspace = 3;
  }
  ```

### 4.3 Update Workspace (Name & Description)
- **Path**: `POST /api/workspaces/update`
- Requires caller to be the owner of the workspace.
- Request:
  ```proto
  message UpdateWorkspaceRequest {
    string workspace_id = 1;
    string name = 2;
    string description = 3;
  }
  ```
- Response:
  ```proto
  message UpdateWorkspaceResponse {
    bool success = 1;
    string error_message = 2;
    Workspace workspace = 3;
  }
  ```

### 4.4 Manage Collaborators
- **Path**: `POST /api/workspaces/collaborators`
- Requires caller to be the owner of the workspace.
- Request:
  ```proto
  message ManageCollaboratorRequest {
    string workspace_id = 1;
    string collaborator_email = 2;
    enum Action {
      ADD = 0;
      REMOVE = 1;
    }
    Action action = 3;
  }
  ```
- Response:
  ```proto
  message ManageCollaboratorResponse {
    bool success = 1;
    string error_message = 2;
    Workspace workspace = 3;
  }
  ```

### 4.5 Delete Workspace
- **Path**: `POST /api/workspaces/delete`
- Requires caller to be the owner of the workspace.
- Request:
  ```proto
  message DeleteWorkspaceRequest {
    string workspace_id = 1;
  }
  ```
- Response:
  ```proto
  message DeleteWorkspaceResponse {
    bool success = 1;
    string error_message = 2;
  }
  ```

---

## 5. UI Integration

### 5.1 Top Navigation Bar (Top-Left Corner)
- Next to the "Doki" logo, displays an interactive **Workspace Selector**
  button/dropdown showing the active workspace's name.
- Clicking the dropdown displays:
  - List of accessible workspaces (owned and shared).
  - Checkmark next to currently active workspace.
  - Quick action: "Manage Workspaces in Settings".
- Switching active workspace updates the current view and triggers a reload
  of workspace-scoped tiles (documents, tree, chat).
- Active workspace ID is stored in client storage (`localStorage`) or session.

### 5.2 Settings Tile (`web/settings/`)
In the full-canvas Settings tile, a dedicated **Workspaces** section provides:
1. **Workspace Overview**:
   - List of all workspaces owned by the user and workspaces shared with them.
   - Shows ownership badge (`Owner` vs `Collaborator`) and count (e.g. `3 / 10 owned`).
2. **Create Workspace Action**:
   - "New Workspace" button (disabled or warning if limit of 10 is reached).
   - Modal/form for workspace name and description.
3. **Workspace Management Card (for Owned Workspaces)**:
   - Edit name and description.
   - **Collaborator Management**:
     - List current collaborator emails with a "Remove" button.
     - "Add Collaborator" input field (email) with validation.
   - **Delete Workspace**:
     - Danger button with confirmation dialog to delete the workspace.
