/**
 * Minimal HTML sanitiser for CMS content.
 *
 * The dashboard editor produces a small, known set of tags. Rather than pull in
 * a full DOM parser, this strips everything dangerous with an allow-list:
 * script/style/iframe/object bodies are removed entirely, event handlers and
 * javascript: URLs are dropped, and any tag outside the allow-list is unwrapped.
 *
 * Content is sanitised on write (before it is stored) AND on read (before it is
 * rendered), so an older row written before a rule tightened is still safe.
 */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
  'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'span', 'div',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'title', 'width', 'height', 'loading']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
};

const VOID_TAGS = new Set(['br', 'hr', 'img']);

function safeUrl(value: string): string | null {
  const trimmed = value.trim();
  // Block javascript:, vbscript: and data: URLs other than plain images.
  if (/^\s*(javascript|vbscript|file):/i.test(trimmed)) return null;
  if (/^\s*data:/i.test(trimmed) && !/^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(trimmed)) return null;
  return trimmed;
}

export function sanitizeHtml(input: string): string {
  if (!input) return '';

  // 1. Remove dangerous elements together with their contents.
  let html = input.replace(
    /<\s*(script|style|iframe|object|embed|form|input|button|link|meta|base|svg|math)\b[\s\S]*?<\s*\/\s*\1\s*>/gi,
    '',
  );
  html = html.replace(/<\s*(script|style|iframe|object|embed|form|input|button|link|meta|base)\b[^>]*\/?>/gi, '');
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  // 2. Walk every remaining tag, dropping what is not allowed.
  html = html.replace(/<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9-]*)\s*([^>]*?)\s*(\/?)>/g, (_match, closing, rawName, rawAttrs, selfClose) => {
    const name = String(rawName).toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return '';
    if (closing) return `</${name}>`;

    const allowed = ALLOWED_ATTRS[name];
    const attrs: string[] = [];

    if (allowed) {
      const attrPattern = /([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = attrPattern.exec(String(rawAttrs))) !== null) {
        const attrName = attrMatch[1]!.toLowerCase();
        if (!allowed.has(attrName)) continue;
        // Any on* handler is rejected by the allow-list already, but be explicit.
        if (attrName.startsWith('on')) continue;

        const value = attrMatch[3] ?? attrMatch[4] ?? attrMatch[5] ?? '';
        if (attrName === 'href' || attrName === 'src') {
          const url = safeUrl(value);
          if (!url) continue;
          attrs.push(`${attrName}="${escapeAttr(url)}"`);
        } else {
          attrs.push(`${attrName}="${escapeAttr(value)}"`);
        }
      }

      // External links must not hand the opener window to another site.
      if (name === 'a' && attrs.some((a) => a.startsWith('target='))) {
        if (!attrs.some((a) => a.startsWith('rel='))) attrs.push('rel="noopener noreferrer"');
      }
    }

    const attrString = attrs.length ? ` ${attrs.join(' ')}` : '';
    if (VOID_TAGS.has(name)) return `<${name}${attrString} />`;
    return `<${name}${attrString}${selfClose ? ' /' : ''}>`;
  });

  return html;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Strip every tag — used for meta descriptions and list previews. */
export function stripHtml(input: string, maxLength?: number): string {
  const text = input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (!maxLength || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}
