# Tree Viewer Specification

## 1. Overview
The **Tree Viewer** is a dockable file navigation tile within Doki Studio that
visualizes the hierarchical document structure of the active workspace. It
translates flat document paths (e.g. `docs/api/spec.md`) into a traditional
nested directory tree with expandable directories, inline action icons, and
document nodes, managed by the recursive split docking engine.

---

## 2. Studio Tile Layout & Placement

### 2.1 Recursive Split Tiling Layout (`DockLayout`)
The Studio canvas uses a recursive split tiling layout rather than overlapping
floating windows:
1. **Split Tiling Tree**:
   - The canvas container is partitioned into recursive split nodes (`row` or
     `col` direction) and leaf panes holding registered tiles (e.g. Explorer
     `tree-tile` and Document Editor `doc-editor-tile`).
   - Tiles never overlap; each tile occupies 100% of its designated dock pane.
2. **Invisible Split Resizer & Center Grip**:
   - Resizing between adjacent tiles is performed by dragging an invisible
     splitter bar (`.dock-splitter`).
   - A centered, rounded rectangle pill icon (`.dock-splitter-grip`) provides a
     clean visual indicator of the resizer.
   - Dragging adjusts flex proportions within safe minimum/maximum ratio bounds.
3. **Drag-to-Dock with Side Highlighting**:
   - Tiles can be dragged to new dock locations via the corner drag handle
     (`.window-corner-drag`) or the window header.
   - While dragging, the source tile is dimmed with reduced opacity (`0.45`),
     an accent dashed outline, and an elevated shadow (`.dock-tile-active-drag`).
   - Moving over destination panes activates the drop overlay indicator
     (`#dock-drop-overlay`), highlighting the candidate docking side
     (left, right, top, or bottom).
   - Releasing docks the tile adjacent to the target pane in a new split.
4. **Persistence & Collapse**:
   - Layout hierarchy is persisted in browser storage
     (`localStorage['doki_dock_tree_v2']`).
   - **Navbar Tree Toggle**: The tree icon button (`#nav-tree-btn`) toggles
     tree visibility (`localStorage['doki_tree_visible']`). When hidden, the
     editor expands to fill 100% of the canvas; toggling back restores the
     previous split layout.

```
+-------------------------------------------------------------------------+
| [Doki] [Workspace: Personal v] [Tree]                       [Gear] [Log]|
+-----------------------------------+-------------------------------------+
| [::] Explorer                     | [::] Editor - readme.md      [Saved]|
|-----------------------------------| +---------------------------------+ |
| v Personal        [+file] [+dir]  | | # Document Title                | |
|   > notes/         [+f][+d][del]  | |                                 | |
|   v src/           [+f][+d][del]  | | [ Textarea Editor ]             | |
|       main.py          [ren][del] | |                                 | |
|     readme.md          [ren][del] | |                                 | |
|                                   | +---------------------------------+ |
+-----------------------------------+-------------------------------------+
```

---

## 3. Tree Hierarchy & Virtual Directories

### 3.1 Workspace as Root
- The root of the tree represents the currently active Workspace
  (e.g. `Personal`).
- The root node supports inline hover actions for creating new files and
  subdirectories at the workspace top level.
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
  - Removal of an empty directory removes it immediately from UI memory.
  - Removal of a non-empty directory deletes all documents residing under
    that directory prefix via the backend API (`/api/documents/delete_prefix`).

### 3.3 Sorting & Organization
- Directories always sort before documents.
- Items within the same directory level are sorted alphabetically
  (case-insensitive).

---

## 4. Visual Language & Icons

The visual language adapts to the active Light / Dark theme using design tokens:
1. **Workspace Root Icon**: SVG icon styled with `var(--accent-strong)`.
2. **Directory Icons**:
   - Expand / Collapse indicator: Chevron right `>` (collapsed) vs Chevron
     down `v` (expanded).
   - Directory icon: SVG styled with `var(--folder)`.
3. **Document Icons**:
   - Clean document page SVG styled with `var(--muted)`.
4. **Per-Item Inline Hover Actions**:
   - Actions are presented as inline SVG buttons on the right side of each node,
     appearing exclusively when hovering over the row (`.tree-item-actions`).
   - **Workspace Root**:
     - `New File`: Prompts for a file name under root.
     - `New Subdirectory`: Prompts for a new top-level folder name.
   - **Directory Nodes**:
     - `New File`: Prompts for a file name under this directory prefix.
     - `New Subdirectory`: Prompts for a subdirectory name under this folder.
     - `Delete Directory`: Trash bin icon (danger highlight) to remove directory.
   - **Document Nodes**:
     - `Rename`: Prompts for a new document name/path.
     - `Delete Document`: Trash bin icon (danger highlight) to delete document.

---

## 5. Interactions & Input Rules

### 5.1 Context Menus Disabled
- Browser and custom right-click context menus are **explicitly disabled** on
  tree nodes and within the tree viewport (`contextmenu` event default
  suppressed).
- All operations are handled via inline hover action buttons and direct click
  interactions.

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
- Visual drop indicator highlights target directory on hover (`.drag-over`).

### 5.4 Directory Deletion
- Clicking the Trash Directory icon:
  - For empty directories: removes the directory directly from UI state.
  - For non-empty directories: confirms with the user and deletes all
    documents under the directory prefix via
    `POST /api/documents/delete_prefix`.

---

## 6. Document Editor Interaction

1. **Opening a Document**:
   - Clicking a document in the tree highlights it as active (`.tree-node.selected`
     with `var(--accent-soft)` background and `var(--accent-text)` text).
   - Loads the document via `GET /api/documents/get?document_id={id}`.
   - Displays the content of shard 0 inside the Document Editor textarea.
2. **Saving Content**:
   - Typing in the textarea editor automatically queues or triggers saving of the
     full string content back to the backend via `POST /api/documents/update`.
