// SVG icon generators and HTML escaping utilities for TreeViewer.

const TreeIcons = (() => {
  // Returns workspace root icon SVG.
  function getWorkspaceSvg() {
    return [
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" ',
      'stroke="#2563eb" stroke-width="2">',
      '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
      '<polyline points="9 22 9 12 15 12 15 22"/>',
      '</svg>'
    ].join('');
  }

  // Returns open or closed directory icon SVG.
  function getFolderSvg(open) {
    const fill = open ? '#fbbf24' : '#fde68a';
    return [
      `<svg width="15" height="15" viewBox="0 0 24 24" fill="${fill}" `,
      'stroke="#d97706" stroke-width="1.5">',
      '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 ',
      '2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
      '</svg>'
    ].join('');
  }

  // Returns document file icon SVG.
  function getFileSvg() {
    return [
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" ',
      'stroke="#64748b" stroke-width="2">',
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 ',
      '2-2V8z"/>',
      '<polyline points="14 2 14 8 20 8"/>',
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

  return { getWorkspaceSvg, getFolderSvg, getFileSvg, escapeHtml };
})();
