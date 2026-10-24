import sanitizeHtml from 'sanitize-html';

const options: sanitizeHtml.IOptions = {
  allowedTags: ['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'a', 'br', 'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'figure', 'figcaption', 'img'],
  allowedAttributes: { a: ['href', 'title', 'rel'], img: ['src', 'alt', 'width', 'height'], th: ['colspan'], td: ['colspan'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  transformTags: {
    h1: 'h2',
    a: (tag, attribs) => ({ tagName: 'a', attribs: { ...attribs, rel: 'noopener noreferrer' } }),
  },
  exclusiveFilter: (f) => ['p', 'li', 'h2', 'h3', 'h4'].includes(f.tag) && !f.text.trim(),
};

/** WordPress page-builder shortcodes ([vc_row …], [woodmart_title …], [/vc_column] …) that leak through as text. */
const SHORTCODE = /\[\/?(?:vc_|woodmart|rev_slider|et_pb_|fusion_|elementor)[^\]]*\]/gi;

/** All rich text from the CMS/import passes through here before it is stored or rendered with dangerouslySetInnerHTML. */
export const cleanHtml = (html: string): string =>
  sanitizeHtml(html.replace(SHORTCODE, ''), options).replace(/(<br\s*\/?>\s*){3,}/g, '<br><br>').trim();
