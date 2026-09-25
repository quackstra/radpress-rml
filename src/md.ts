// Safe markdown rendering: raw HTML disabled, in-site links routed to Radpress,
// external links sandboxed, images demoted to links (image handling is a later brief).
import MarkdownIt from 'markdown-it';
import { normalizePath } from '@quackdown/core';

const isExternal = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('#');

export function makeRenderer(site: string) {
  const md = new MarkdownIt({ html: false, linkify: true });
  const inSite = (p: string) => { try { return `#/s/${encodeURIComponent(site)}/${encodeURIComponent(normalizePath(p))}`; } catch { return '#'; } };

  const baseLink = md.renderer.rules.link_open ?? ((t, i, o, _e, s) => s.renderToken(t, i, o));
  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const tok = tokens[idx]!;
    const hi = tok.attrIndex('href');
    if (hi >= 0) {
      const href = tok.attrs![hi]![1];
      if (href.startsWith('#')) { /* leave */ }
      else if (isExternal(href)) { tok.attrSet('rel', 'noopener noreferrer'); tok.attrSet('target', '_blank'); }
      else tok.attrs![hi]![1] = inSite(href);
    }
    return baseLink(tokens, idx, opts, env, self);
  };
  md.renderer.rules.image = (tokens, idx) => {
    const tok = tokens[idx]!;
    const si = tok.attrIndex('src');
    const src = si >= 0 ? tok.attrs![si]![1] : '';
    const alt = tok.content || src;
    const href = isExternal(src) ? src : inSite(src);
    const rel = isExternal(src) ? ' rel="noopener noreferrer" target="_blank"' : '';
    return `<a href="${md.utils.escapeHtml(href)}"${rel} class="rp-img">🖼 ${md.utils.escapeHtml(alt)}</a>`;
  };
  return (markdown: string) => md.render(markdown);
}
