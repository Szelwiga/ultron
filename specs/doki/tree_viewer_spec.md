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
| [::] Personal        [+f][+d] [x] | [::] [home] readme.md        [Saved]|
|-----------------------------------| +---------------------------------+ |
| > notes/             [+f][+d][del]| | # Document Title                | |
| v src/               [+f][+d][del]| |                                 | |
|     main.py             [ren][del]| | [ Textarea Editor ]             | |
|   readme.md             [ren][del]| |                                 | |
|                                   | +---------------------------------+ |
+-----------------------------------+-------------------------------------+
```

---

## 3. Tree Hierarchy & Virtual Directories

### 3.1 Workspace in Tree Header & Actions
- The tree viewer tile header displays the active Workspace name in natural casing
  (no all-caps, no home icon), along with an `✕` close button to hide/dock out the
  tree viewer.
- The `+file` and `+folder` action buttons in the tree header are hidden by default
  and reveal on hover.
- The document tree hierarchy renders top-level files and directories directly
  inside the tree body starting from depth 0.
- Directory ("catalog") icons use outline contours only (`fill="none"`) to align
  consistently with document file icons.
- Switching workspaces in the top-left dropdown or settings updates the tree tile
  header immediately, persisting across tree reopenings.

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
     - `Open in New Editor`: Split window SVG icon to spawn a new dockable editor
       tile docked in the split layout.
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

### 5.5 Unified Top-Level Modal Dialogs (`ModalDialog`)
- Native browser `alert()`, `confirm()`, and prompt dialogs are replaced with a
  unified top-level modal dialog system (`ModalDialog`).
- **Confirmation Modals**:
  - Deleting files, directories, or workspaces prompts via styled modal dialogs
    with explicit title, description, and danger button styling.
- **Input Prompt Modals**:
  - Input prompts for file creation, directory creation, and renaming enforce
    immediate validation disallowing whitespace and empty input.
- **Alert Modals**:
  - Network and API error notifications appear in unified themed dialogs with
    Escape/Enter keyboard shortcuts and backdrop click handling.

---

## 6. Document Editor Interaction

1. **Opening a Document & Main Editor Tile**:
   - Every editor tile is dynamically created, identically styled, and completely closable.
   - The first opened editor tile is designated as the main editor and displays the home
     icon (styled after the personal workspace home icon) with a subtle yellow background
     (`var(--accent-soft)`) and 5px border-radius directly before the document name.
   - Clicking a document in the tree opens it into the main editor (or focuses it if
     already open in another editor).
   - If the main editor is closed, the main role automatically transitions to another
     open editor tile and the home icon moves to that editor.
   - Clicking the **Open in New Editor** hover icon (`[|]`) on any document spawns a
     secondary editor tile docked adjacent in the recursive split layout, enabling
     side-by-side document comparison and simultaneous editing.
2. **Preventing Duplicate Open Documents**:
   - The system prevents opening the same document multiple times across editor tiles.
   - If a document is already open in any tile, clicking it in the tree or selecting "Open
     in New Editor" immediately shifts focus to that existing editor tile without creating a
     duplicate.
3. **Subtle Explorer Tree Indicators (Subtle Yellow Icon Background)**:
   - Any document open in any editor tile is marked by giving only the file icon a subtle
     yellow background (`var(--accent-soft)`) with 5px border-radius and high contrast stroke
     (`.tree-node.opened-doc .tree-icon`).
   - The dot indicator is removed.
   - There is no row background highlight or color differentiation between the currently
     edited file and background open files: both appear identical in the tree with no diff.
4. **Clean Editor Border Styling**:
   - All editor tiles have identical clean borders without accent border glow or color
     divergence (`no editor-tile-focused border override`).
5. **Editor Close & Multi-Tile Management**:
   - Each editor tile has an enlarged dedicated close button (`✕`) with red hover highlighting.
   - Closing any editor tile removes it completely from the dock split tree and DOM,
     collapsing adjacent splits cleanly.
6. **Welcome Tile (`welcome-tile`) & Persistent Fallback**:
   - When no editor tiles are open (or only the tree viewer is open), the Welcome tile
     is always present on the canvas opposite the tree viewer (or 100% if tree is hidden),
     including on initial page load / refresh.
   - The Welcome tile blends seamlessly into the canvas background (`background: transparent;
     border: none; box-shadow: none;`).
   - It displays a personalized greeting ("Hi {username}") and lists up to 5 recent documents
     with one-click opening.
   - Opening any document replaces the Welcome tile with the editor tile; closing all editor
     tiles automatically restores the Welcome tile.
7. **Autosave-Only Persistence**:
   - The manual "Save" button is removed from the editor window header; the editor relies
     entirely on automatic background debounced saving (800ms) with a real-time status badge
     ("Saved", "Saving...", "Unsaved changes") syncing with `POST /api/documents/update`.
