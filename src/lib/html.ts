/** Escape for both text content and attribute values. */
export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Profile colours end up in inline styles: accept only hex. */
export function safeColor(color: string): string {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : '#808080';
}
