// DockLayout: Recursive tiling and split docking manager for Doki Studio.

const DockLayout = (() => {
  const STORAGE_KEY = 'doki_dock_tree_v2';
  let canvasContainer = null;
  let dropOverlay = null;

  // Registered tiles: tileId -> HTMLElement
  const tiles = {};

  // Drag-to-dock state
  let dragSourceTileId = null;
  let activeDropTarget = null;
  let isTreeTileHidden = false;

  // Default initial layout: TreeViewer on the left (26%), Welcome on the right (74%)
  const DEFAULT_TREE = {
    type: 'split',
    direction: 'row',
    ratio: 0.26,
    first: { type: 'leaf', id: 'tree-tile' },
    second: { type: 'leaf', id: 'welcome-tile' }
  };

  let currentTree = null;

  // Initializes docking engine, mounts containers, and renders split layout.
  function init() {
    canvasContainer = document.getElementById('canvas-container');
    if (!canvasContainer) return;

    const treeEl = document.getElementById('tree-tile');
    const welcomeEl = document.getElementById('welcome-tile');
    if (treeEl) tiles['tree-tile'] = treeEl;
    if (welcomeEl) tiles['welcome-tile'] = welcomeEl;

    // Load persisted layout tree or default
    currentTree = loadTree() || cloneTree(DEFAULT_TREE);

    // Create drop overlay indicator element
    dropOverlay = document.createElement('div');
    dropOverlay.id = 'dock-drop-overlay';
    dropOverlay.style.display = 'none';

    // Setup drag handles on registered tiles
    Object.keys(tiles).forEach(id => {
      setupTileDrag(tiles[id], id);
    });

    const storedVisible = localStorage.getItem('doki_tree_visible');
    if (storedVisible === 'false') {
      isTreeTileHidden = true;
    }

    render();

    // Toggle button in navbar
    const navTreeBtn = document.getElementById('nav-tree-btn');
    if (navTreeBtn) {
      navTreeBtn.addEventListener('click', toggleTreeTile);
    }
  }

  // Clones tree object deeply.
  function cloneTree(node) {
    if (!node) return null;
    if (node.type === 'leaf') return { type: 'leaf', id: node.id };
    return {
      type: 'split',
      direction: node.direction,
      ratio: node.ratio,
      first: cloneTree(node.first),
      second: cloneTree(node.second)
    };
  }

  // Collects all leaf IDs present in a layout node.
  function getLeafIds(node) {
    if (!node) return [];
    if (node.type === 'leaf') return [node.id];
    if (node.type === 'split') {
      return [...getLeafIds(node.first), ...getLeafIds(node.second)];
    }
    return [];
  }

  // Ensures welcome-tile is present if no document editor tiles are open.
  function ensureWelcomeIfNoEditors(tree) {
    if (!tree) return cloneTree(DEFAULT_TREE);
    const leafIds = getLeafIds(tree);
    const hasEditors = leafIds.some(lId => typeof lId === 'string' && lId.startsWith('doc-editor-tile'));
    if (!hasEditors) {
      const hasTree = leafIds.includes('tree-tile');
      if (hasTree) {
        if (!leafIds.includes('welcome-tile')) {
          return {
            type: 'split',
            direction: 'row',
            ratio: (tree && typeof tree.ratio === 'number') ? tree.ratio : 0.26,
            first: { type: 'leaf', id: 'tree-tile' },
            second: { type: 'leaf', id: 'welcome-tile' }
          };
        }
      } else {
        return { type: 'leaf', id: 'welcome-tile' };
      }
    }
    return tree;
  }

  // Loads layout tree from localStorage with validation.
  function loadTree() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (validateTree(parsed)) {
        const sanitized = sanitizeTree(parsed);
        if (sanitized) {
          return ensureWelcomeIfNoEditors(sanitized);
        }
      }
    } catch (e) {
      console.warn('Failed to load saved dock layout', e);
    }
    return null;
  }

  // Sanitizes layout tree to keep only tiles that are registered or permanent.
  function sanitizeTree(node) {
    if (!node) return null;
    if (node.type === 'leaf') {
      if (node.id === 'tree-tile' || node.id === 'welcome-tile' || tiles[node.id]) {
        return node;
      }
      return null;
    }
    if (node.type === 'split') {
      const first = sanitizeTree(node.first);
      const second = sanitizeTree(node.second);
      if (!first && !second) return null;
      if (!first) return second;
      if (!second) return first;
      return {
        type: 'split',
        direction: node.direction,
        ratio: node.ratio,
        first: first,
        second: second
      };
    }
    return null;
  }

  // Saves layout tree to localStorage.
  function saveTree() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentTree));
    } catch (e) {
      console.warn('Failed to save dock layout', e);
    }
  }

  // Validates structure of a layout tree.
  function validateTree(node) {
    if (!node || typeof node !== 'object') return false;
    if (node.type === 'leaf') return typeof node.id === 'string';
    if (node.type === 'split') {
      return (node.direction === 'row' || node.direction === 'col') &&
          typeof node.ratio === 'number' &&
          !isNaN(node.ratio) &&
          validateTree(node.first) &&
          validateTree(node.second);
    }
    return false;
  }

  // Renders the entire docking hierarchy inside canvas container.
  function render() {
    if (!canvasContainer) return;

    currentTree = ensureWelcomeIfNoEditors(currentTree);

    // Detach tiles safely and hide welcome tile by default
    Object.values(tiles).forEach(tile => {
      if (tile.parentElement) {
        tile.parentElement.removeChild(tile);
      }
    });
    if (tiles['welcome-tile']) {
      tiles['welcome-tile'].style.display = 'none';
    }

    canvasContainer.innerHTML = '';
    canvasContainer.appendChild(dropOverlay);

    const activeTree = isTreeTileHidden
        ? removeLeaf(cloneTree(currentTree), 'tree-tile')
        : currentTree;

    if (activeTree) {
      const rootDom = renderNode(activeTree);
      rootDom.style.width = '100%';
      rootDom.style.height = '100%';
      rootDom.style.flex = '1';
      canvasContainer.appendChild(rootDom);
      if (findLeaf(activeTree, 'tree-tile') && typeof TreeViewer !== 'undefined') {
        if (TreeViewer.updateHeaderWorkspace) {
          TreeViewer.updateHeaderWorkspace();
        }
      }
      if (findLeaf(activeTree, 'welcome-tile') && typeof WelcomeTile !== 'undefined' && WelcomeTile.render) {
        WelcomeTile.render();
      }
    } else if (tiles['welcome-tile']) {
      const pane = document.createElement('div');
      pane.className = 'dock-pane';
      pane.dataset.tileId = 'welcome-tile';
      pane.style.width = '100%';
      pane.style.height = '100%';
      pane.style.flex = '1';
      const welcomeEl = tiles['welcome-tile'];
      welcomeEl.style.width = '100%';
      welcomeEl.style.height = '100%';
      welcomeEl.style.flex = '1';
      welcomeEl.style.display = 'flex';
      pane.appendChild(welcomeEl);
      canvasContainer.appendChild(pane);
      if (typeof WelcomeTile !== 'undefined' && WelcomeTile.render) {
        WelcomeTile.render();
      }
    }
  }

  // Recursively generates DOM elements for a layout node.
  function renderNode(node) {
    if (node.type === 'leaf') {
      const pane = document.createElement('div');
      pane.className = 'dock-pane';
      pane.dataset.tileId = node.id;
      pane.style.width = '100%';
      pane.style.height = '100%';

      const tile = tiles[node.id];
      if (tile) {
        tile.style.position = 'relative';
        tile.style.top = '0';
        tile.style.left = '0';
        tile.style.width = '100%';
        tile.style.height = '100%';
        tile.style.flex = '1';
        if (node.id === 'welcome-tile') {
          tile.style.display = 'flex';
        }
        pane.appendChild(tile);
      }
      return pane;
    }

    if (node.type === 'split') {
      const splitEl = document.createElement('div');
      splitEl.className = `dock-split-container dock-split-${node.direction}`;
      splitEl.style.width = '100%';
      splitEl.style.height = '100%';
      splitEl.style.flex = '1';

      const firstDom = renderNode(node.first);
      firstDom.style.flex = `${node.ratio} ${node.ratio} 0%`;
      splitEl.appendChild(firstDom);

      const secondDom = renderNode(node.second);
      secondDom.style.flex = `${1 - node.ratio} ${1 - node.ratio} 0%`;

      const splitter = createSplitter(node, splitEl, firstDom, secondDom);
      splitEl.appendChild(splitter);
      splitEl.appendChild(secondDom);

      return splitEl;
    }

    return document.createElement('div');
  }

  // Creates split resizer bar with grip icon.
  function createSplitter(splitNode, container, firstDom, secondDom) {
    const splitter = document.createElement('div');
    splitter.className = `dock-splitter dock-splitter-${splitNode.direction}`;
    splitter.title = 'Drag to resize';

    const grip = document.createElement('div');
    grip.className = 'dock-splitter-grip';
    splitter.appendChild(grip);

    splitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      document.body.classList.add(`dock-resizing-${splitNode.direction}`);

      const onMouseMove = (moveEvent) => {
        const cRect = container.getBoundingClientRect();
        let newRatio;
        if (splitNode.direction === 'row') {
          const total = Math.max(1, cRect.width);
          const x = moveEvent.clientX - cRect.left;
          const minRatio = Math.min(0.4, 140 / total);
          const maxRatio = 1 - minRatio;
          newRatio = Math.max(minRatio, Math.min(maxRatio, x / total));
        } else {
          const total = Math.max(1, cRect.height);
          const y = moveEvent.clientY - cRect.top;
          const minRatio = Math.min(0.4, 100 / total);
          const maxRatio = 1 - minRatio;
          newRatio = Math.max(minRatio, Math.min(maxRatio, y / total));
        }

        splitNode.ratio = newRatio;
        firstDom.style.flex = `${newRatio} ${newRatio} 0%`;
        secondDom.style.flex = `${1 - newRatio} ${1 - newRatio} 0%`;
      };

      const onMouseUp = () => {
        document.body.classList.remove(`dock-resizing-${splitNode.direction}`);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        saveTree();
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    return splitter;
  }

  // Sets up tile drag listeners on corner drag and header.
  function setupTileDrag(tileEl, tileId) {
    tileEl.addEventListener('mousedown', (e) => {
      const isDragHandle = e.target.closest('.window-corner-drag');
      const isHeader = e.target.closest('.window-header');
      if (!isDragHandle && !isHeader) return;
      if (!isDragHandle && e.target.closest('button, input, textarea, a')) {
        return;
      }

      e.preventDefault();
      dragSourceTileId = tileId;
      activeDropTarget = null;
      tileEl.classList.add('dock-tile-active-drag');
      document.body.classList.add('dock-tile-dragging');

      const onMouseMove = (moveEvent) => {
        handleDragMove(moveEvent, tileId);
      };

      const onMouseUp = () => {
        tileEl.classList.remove('dock-tile-active-drag');
        document.querySelectorAll('.dock-tile-active-drag').forEach(el => {
          el.classList.remove('dock-tile-active-drag');
        });
        document.body.classList.remove('dock-tile-dragging');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        dropOverlay.style.display = 'none';

        if (activeDropTarget && activeDropTarget.targetTileId !== dragSourceTileId) {
          dockTile(dragSourceTileId, activeDropTarget.targetTileId, activeDropTarget.side);
          saveTree();
          render();
        }
        dragSourceTileId = null;
        activeDropTarget = null;
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  // Handles drag move detecting hover side and updating highlight overlay.
  function handleDragMove(e, sourceId) {
    const cRect = canvasContainer.getBoundingClientRect();
    const cursorX = e.clientX;
    const cursorY = e.clientY;

    const panes = canvasContainer.querySelectorAll('.dock-pane');
    let foundTarget = null;

    for (const pane of panes) {
      const targetId = pane.dataset.tileId;
      if (targetId === sourceId) continue;

      const pRect = pane.getBoundingClientRect();
      if (cursorX >= pRect.left && cursorX <= pRect.right &&
          cursorY >= pRect.top && cursorY <= pRect.bottom) {

        const relX = (cursorX - pRect.left) / pRect.width;
        const relY = (cursorY - pRect.top) / pRect.height;

        let side = 'left';
        if (relX < 0.35) side = 'left';
        else if (relX > 0.65) side = 'right';
        else if (relY < 0.35) side = 'top';
        else if (relY > 0.65) side = 'bottom';
        else {
          const dL = relX, dR = 1 - relX, dT = relY, dB = 1 - relY;
          const min = Math.min(dL, dR, dT, dB);
          if (min === dL) side = 'left';
          else if (min === dR) side = 'right';
          else if (min === dT) side = 'top';
          else side = 'bottom';
        }

        foundTarget = { targetTileId: targetId, side: side, rect: pRect };
        break;
      }
    }

    if (!foundTarget) {
      activeDropTarget = null;
      dropOverlay.style.display = 'none';
      return;
    }

    activeDropTarget = foundTarget;

    let ox = foundTarget.rect.left - cRect.left;
    let oy = foundTarget.rect.top - cRect.top;
    let ow = foundTarget.rect.width;
    let oh = foundTarget.rect.height;

    if (foundTarget.side === 'left') {
      ow = ow / 2;
    } else if (foundTarget.side === 'right') {
      ox = ox + ow / 2;
      ow = ow / 2;
    } else if (foundTarget.side === 'top') {
      oh = oh / 2;
    } else if (foundTarget.side === 'bottom') {
      oy = oy + oh / 2;
      oh = oh / 2;
    }

    dropOverlay.style.left = `${ox + 2}px`;
    dropOverlay.style.top = `${oy + 2}px`;
    dropOverlay.style.width = `${ow - 4}px`;
    dropOverlay.style.height = `${oh - 4}px`;
    dropOverlay.style.display = 'block';
  }

  // Rearranges tree by removing source and inserting adjacent to target.
  function dockTile(sourceId, targetId, side) {
    if (!currentTree || sourceId === targetId) return;

    currentTree = removeLeaf(currentTree, sourceId);
    if (!currentTree) {
      currentTree = { type: 'leaf', id: targetId };
    }

    currentTree = insertRelative(currentTree, targetId, sourceId, side);
  }

  // Removes a leaf from the tree and collapses empty splits.
  function removeLeaf(node, leafId) {
    if (!node) return null;
    if (node.type === 'leaf') {
      return node.id === leafId ? null : node;
    }
    if (node.type === 'split') {
      const newFirst = removeLeaf(node.first, leafId);
      const newSecond = removeLeaf(node.second, leafId);

      if (!newFirst && !newSecond) return null;
      if (!newFirst) return newSecond;
      if (!newSecond) return newFirst;

      return {
        type: 'split',
        direction: node.direction,
        ratio: node.ratio,
        first: newFirst,
        second: newSecond
      };
    }
    return node;
  }

  // Inserts sourceId next to targetId creating a new split.
  function insertRelative(node, targetId, sourceId, side) {
    if (!node) return { type: 'leaf', id: sourceId };

    if (node.type === 'leaf') {
      if (node.id === targetId) {
        const isHorizontal = (side === 'left' || side === 'right');
        const direction = isHorizontal ? 'row' : 'col';
        const isSourceFirst = (side === 'left' || side === 'top');

        const firstId = isSourceFirst ? sourceId : targetId;
        const secondId = isSourceFirst ? targetId : sourceId;
        let defaultRatio = 0.5;
        if (firstId === 'tree-tile') defaultRatio = 0.28;
        else if (secondId === 'tree-tile') defaultRatio = 0.72;

        return {
          type: 'split',
          direction: direction,
          ratio: defaultRatio,
          first: { type: 'leaf', id: firstId },
          second: { type: 'leaf', id: secondId }
        };
      }
      return node;
    }

    if (node.type === 'split') {
      return {
        type: 'split',
        direction: node.direction,
        ratio: node.ratio,
        first: insertRelative(node.first, targetId, sourceId, side),
        second: insertRelative(node.second, targetId, sourceId, side)
      };
    }

    return node;
  }

  // Toggles visibility of the tree viewer tile.
  function toggleTreeTile() {
    isTreeTileHidden = !isTreeTileHidden;
    localStorage.setItem('doki_tree_visible', isTreeTileHidden ? 'false' : 'true');
    render();
  }

  // Opens a new tile docked adjacent to an existing target tile.
  function openTileSplit(newId, newEl, targetId, side = 'right') {
    tiles[newId] = newEl;
    setupTileDrag(newEl, newId);

    // If welcome-tile is in the tree, replace it with the new editor
    if (findLeaf(currentTree, 'welcome-tile')) {
      currentTree = replaceLeaf(currentTree, 'welcome-tile', newId);
    } else {
      let dockTarget = targetId;
      if (!dockTarget || !findLeaf(currentTree, dockTarget)) {
        dockTarget = findFirstEditorLeaf(currentTree);
      }

      if (!dockTarget || !findLeaf(currentTree, dockTarget)) {
        currentTree = {
          type: 'split',
          direction: 'row',
          ratio: 0.26,
          first: { type: 'leaf', id: 'tree-tile' },
          second: { type: 'leaf', id: newId }
        };
      } else {
        currentTree = insertRelative(currentTree, dockTarget, newId, side);
      }
    }

    saveTree();
    render();
  }

  // Removes a tile from the dock tree and DOM.
  function removeTile(id) {
    if (!tiles[id]) return;
    delete tiles[id];
    currentTree = removeLeaf(currentTree, id);
    currentTree = ensureWelcomeIfNoEditors(currentTree);
    saveTree();
    render();
  }

  // Replaces a leaf ID with another in the tree.
  function replaceLeaf(node, oldId, newId) {
    if (!node) return null;
    if (node.type === 'leaf') {
      return node.id === oldId ? { type: 'leaf', id: newId } : node;
    }
    if (node.type === 'split') {
      return {
        type: 'split',
        direction: node.direction,
        ratio: node.ratio,
        first: replaceLeaf(node.first, oldId, newId),
        second: replaceLeaf(node.second, oldId, newId)
      };
    }
    return node;
  }

  // Checks if a leaf with given ID exists in tree.
  function findLeaf(node, id) {
    if (!node) return false;
    if (node.type === 'leaf') return node.id === id;
    if (node.type === 'split') {
      return findLeaf(node.first, id) || findLeaf(node.second, id);
    }
    return false;
  }

  // Finds first editor leaf ID in tree.
  function findFirstEditorLeaf(node) {
    if (!node) return null;
    if (node.type === 'leaf') {
      return (typeof node.id === 'string' && node.id.startsWith('doc-editor-tile'))
          ? node.id
          : null;
    }
    if (node.type === 'split') {
      return findFirstEditorLeaf(node.first) || findFirstEditorLeaf(node.second);
    }
    return null;
  }

  return { init, render, toggleTreeTile, openTileSplit, removeTile, findLeaf };
})();
