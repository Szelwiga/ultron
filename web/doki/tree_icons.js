// SVG icon generators and HTML escaping utilities for TreeViewer.

const TreeIcons = (() => {
  // Returns workspace root icon SVG.
  function getWorkspaceSvg() {
    return [
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" ',
      'stroke="var(--accent-strong)" stroke-width="2">',
      '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
      '<polyline points="9 22 9 12 15 12 15 22"/>',
      '</svg>'
    ].join('');
  }

  // Returns open or closed directory icon SVG with contours only.
  function getFolderSvg(open) {
    return [
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" ',
      'stroke="var(--folder)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">',
      '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 ',
      '2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
      '</svg>'
    ].join('');
  }

  // Returns document file icon SVG.
  function getFileSvg() {
    return [
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" ',
      'stroke="var(--muted)" stroke-width="2">',
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 ',
      '2-2V8z"/>',
      '<polyline points="14 2 14 8 20 8"/>',
      '</svg>'
    ].join('');
  }

  // Returns new file icon SVG.
  function getNewFileSvg() {
    return [
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" ',
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ',
      'stroke-linejoin="round">',
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>',
      '<polyline points="14 2 14 8 20 8"/>',
      '<line x1="12" y1="18" x2="12" y2="12"/>',
      '<line x1="9" y1="15" x2="15" y2="15"/>',
      '</svg>'
    ].join('');
  }

  // Returns new subdirectory / folder icon SVG.
  function getNewFolderSvg() {
    return [
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" ',
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ',
      'stroke-linejoin="round">',
      '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
      '<line x1="12" y1="11" x2="12" y2="17"/>',
      '<line x1="9" y1="14" x2="15" y2="14"/>',
      '</svg>'
    ].join('');
  }

  // Returns trash / delete icon SVG.
  function getTrashSvg() {
    return [
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" ',
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ',
      'stroke-linejoin="round">',
      '<polyline points="3 6 5 6 21 6"/>',
      '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
      '</svg>'
    ].join('');
  }

  // Returns rename / edit icon SVG.
  function getRenameSvg() {
    return [
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" ',
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ',
      'stroke-linejoin="round">',
      '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
      '</svg>'
    ].join('');
  }

  // Returns 6-dots drag grip icon SVG.
  function getDragGripSvg() {
    return [
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">',
      '<circle cx="8" cy="6" r="2"/><circle cx="16" cy="6" r="2"/>',
      '<circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/>',
      '<circle cx="8" cy="18" r="2"/><circle cx="16" cy="18" r="2"/>',
      '</svg>'
    ].join('');
  }

  // Returns split editor / open in new editor icon SVG.
  function getSplitEditorSvg() {
    return [
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" ',
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ',
      'stroke-linejoin="round">',
      '<rect x="3" y="3" width="18" height="18" rx="2"/>',
      '<line x1="12" y1="3" x2="12" y2="21"/>',
      '</svg>'
    ].join('');
  }

  // Escapes special HTML characters.
  function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
  }

  return {
    getWorkspaceSvg,
    getFolderSvg,
    getFileSvg,
    getNewFileSvg,
    getNewFolderSvg,
    getTrashSvg,
    getRenameSvg,
    getDragGripSvg,
    getSplitEditorSvg,
    escapeHtml
  };
})();
