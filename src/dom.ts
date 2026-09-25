export function el(tag: string, attrs: Record<string, string> = {}, ...kids: (Node | string)[]): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const k of kids) e.append(k);
  return e;
}
export const short = (a: string) => a.slice(0, 16) + '…' + a.slice(-6);

export function chrome(...extra: Node[]): HTMLElement {
  return el('header', { class: 'rp-top' },
    el('a', { href: '#/', class: 'rp-brand' }, '🦆 Radpress'),
    el('nav', { class: 'rp-nav' }, el('a', { href: '#/studio' }, 'Studio'), ...extra));
}
