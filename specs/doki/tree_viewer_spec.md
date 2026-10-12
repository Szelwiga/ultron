# Tree Viewer Specification

## 1. Overview
The **Tree Viewer** is a draggable file navigation tile within Doki Studio that
visualizes the hierarchical document structure of the active workspace. It
translates flat document paths (e.g. `docs/api/spec.md`) into a traditional
nested directory tree with expandable directories and document nodes.

---

## 2. Studio Tile Layout & Placement

### 2.1 Default Position & Layout
- By default, the Tree Viewer tile is docked on the **left side** of the
  Studio canvas.
- The tile can be freely resized and dragged across the workspace canvas.
- **Top Navigation Bar Toggle**:
  - A dedicated **Tree Icon Button** is located on the **left side** of the
    top navigation bar (next to the workspace switcher).
  - Clicking toggles the Tree Viewer tile between visible and hidden.
  - The visibility state is persisted in client storage
    (`localStorage['doki_tree_visible']`).

```
+-------------------------------------------------------------------------+
| [Doki] [Workspace: Personal v] [Tree]                       [Gear] [Log]|
+-----------------------------------+-------------------------------------+
| Tree Viewer                       | Document Editor Canvas              |
| [+][Trash][^][R]                  | +---------------------------------+ |
|-----------------------------------| | # Document Title                | |
| v Personal                        | |                                 | |
|   > notes/                        | | [ Textarea Editor ]             | |
|   v src/                          | |                                 | |
|       main.py                     | |                                 | |
|     readme.md                     | |                                 | |
|                                   | +---------------------------------+ |
+-----------------------------------+-------------------------------------+
```

---

## 3. Tree Hierarchy & Virtual Directories

### 3.1 Workspace as Root
- The root of the tree represents the currently active Workspace
  (e.g. `Personal`).
- Switching workspaces in the top-left dropdown re-renders the root and
  refreshes the document tree for the newly selected workspace.

### 3.2 Virtual Directories
- Directories are **purely client-side structures** derived by splitting
  document names by the path separator `/`.
  - Example: `docs/planning/q1.md` produces root -> directory `docs` ->
    directory `planning` -> document `q1.md`.
- **Ephemeral Empty Directories**:
  - A user can create a new directory inside the tree.
  - While it has no documents, it is stored in-memory in the UI tree state.
  - Upon page refresh (or workspace switch), any empty directory is discarded,
    since no backend document exists with that path prefix.
- **Removal of Directories**:
  - Removal of an empty directory is permitted and removes it immediately
    from UI memory.
  - Removal of a non-empty directory deletes all documents residing under
    that directory prefix via the backend API.

### 3.3 Sorting & Organization
- Directories always sort before documents.
- Items within the same directory level are sorted alphabetically
  (case-insensitive).

---

## 4. Visual Language & Icons

Clean SVG icons styled to complement the application's light theme:
1. **Workspace Root Icon**: Directory icon with home/workspace badge.
2. **Directory Icons**:
   - Expand / Collapse indicator: Chevron right `>` (collapsed) vs Chevron
     down `v` (expanded).
   - Directory icon: Closed directory SVG when collapsed, open directory
     SVG when expanded.
3. **Document Icons**:
   - Clean document page icon.
   - Extension badge or accent for common extensions (`.md`, `.txt`, `.py`).
4. **Header Toolbar Action Icons**:
   - **New File (`+`)**: Prompts document name creation under selected
     directory or root.
   - **Trash Directory**: Trash bin icon to remove the selected directory.
   - **Collapse All (`^`)**: Collapses all open directories in the tree.
   - **Refresh (`R`)**: Re-fetches documents from `/api/documents`.

---

## 5. Interactions & Context Menus

### 5.1 Right-Click Context Menu
Right-clicking an item in the tree displays a contextual action menu:

- **Workspace Root**:
  - `New File...`
  - `New Directory...`
- **Directory Node**:
  - `New File Here...`
  - `New Directory Here...`
  - `Rename Directory...`
  - `Trash Directory`
- **Document Node**:
  - `Open in Editor`
  - `Rename...`
  - `Delete Document`

### 5.2 Naming Rules & Validation
- **No Spaces Allowed**:
  - Document names and directory path segments must **never contain spaces**.
  - Validation regex: `^[^\s/]+$` for individual segments.
  - Interactive input prompts provide immediate visual feedback (red border and
    message: *"File and directory names cannot contain spaces"*).
- Disallowed characters: spaces, control characters, leading/trailing slashes.

### 5.3 Moving Files & Directories (Drag & Drop)
- **Move File**: Dragging a document node into another directory or root
  updates the document's path:
  - Example: Dragging `a.txt` from root into `docs/` sends rename
    `a.txt` -> `docs/a.txt`.
- **Move Directory**: Dragging a directory into another directory moves all
  nested documents using the batch prefix rename endpoint:
  - Example: Dragging `src/` into `archive/` updates all
    `src/*` -> `archive/src/*`.
- Visual drop indicator highlights target directory on hover.

### 5.4 Directory Deletion
- Clicking the Trash Directory icon or context menu item:
  - For empty directories: removes the directory directly from UI state.
  - For non-empty directories: confirms with the user and deletes all
    documents under the directory prefix via
    `POST /api/documents/delete_prefix`.

---

## 6. Document Editor Interaction

1. **Opening a Document**:
   - Clicking a document in the tree highlights it as active.
   - Loads the document via `GET /api/documents/get?document_id={id}`.
   - Displays the content of shard 0 inside the Document Editor textarea.
2. **Saving Content**:
   - Typing in the textarea editor saves the full string content back to the
     backend via `POST /api/documents/update`.
