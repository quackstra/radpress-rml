// Radpress Studio: a self-serve, in-browser workspace to build a site on Stokenet.
// Account (generate/paste a testnet key, fund from faucet), Compose, Theme editor,
// and Pages — with a cart that publishes in ONE transaction, signed in the browser.
import { el, short, chrome } from './dom.js';
import { makeRenderer } from './md.js';
import { applyTheme, DEFAULT_THEME, type ThemeTokens } from './theme.js';
import { loadCart, saveCart, makeContent, previewCommit, exportCart, type CartAction } from './compose.js';
import { getIdentity, setIdentity, clearIdentity, genKeyHex, isValidKeyHex, type Identity } from './account.js';
import { deriveAccount, fundFromFaucet, xrdBalance, publishCart, registerSite } from './signer.js';
import { getSite, publishedPaths } from './data.js';
import { normalizePath } from '@quackdown/core';

type Tab = 'account' | 'compose' | 'theme' | 'pages';
const app = () => document.getElementById('app')!;

let tab: Tab = 'account';
let busy = '';
let themeDraft: ThemeTokens = { ...DEFAULT_THEME };
let composeSeed: { type?: string; path?: string; title?: string; body?: string } = {};

export async function openStudio() {
  const id = getIdentity();
  tab = id ? 'compose' : 'account';
  applyTheme(DEFAULT_THEME);
  render();
}

function render() {
  const id = getIdentity();
  const tabs = el('div', { class: 'rp-tabs' });
  for (const t of ['account', 'compose', 'theme', 'pages'] as Tab[]) {
    const b = el('button', { class: 'rp-tab' + (t === tab ? ' active' : '') }, t);
    b.addEventListener('click', () => { tab = t; render(); });
    tabs.append(b);
  }
  const body = el('div', { class: 'rp-studio-body' });
  if (tab === 'account') accountTab(body, id);
  else if (tab === 'compose') composeTab(body);
  else if (tab === 'theme') themeTab(body, id);
  else pagesTab(body, id);

  const main = el('main', { class: 'rp-main' },
    el('h1', { class: 'rp-h1' }, 'Studio'),
    identityBar(id), tabs, body, cartPanel(id));
  app().replaceChildren(chrome(), main);
}

function identityBar(id: Identity | null): HTMLElement {
  if (!id) return el('div', { class: 'rp-idbar rp-muted' }, 'No account yet — go to the Account tab to generate or paste a Stokenet key.');
  const bar = el('div', { class: 'rp-idbar' },
    el('span', { class: 'rp-iddot' }, '●'),
    el('span', { class: 'rp-idacct', title: id.account }, short(id.account)));
  const bal = el('span', { class: 'rp-idbal rp-muted' }, '…XRD');
  bar.append(bal);
  xrdBalance(id.account).then((x) => (bal.textContent = `${x.toFixed(0)} XRD`)).catch(() => (bal.textContent = '? XRD'));
  return bar;
}

function accountTab(body: HTMLElement, id: Identity | null) {
  body.append(el('div', { class: 'rp-warn' }, '⚠ Stokenet testnet only. This stores a play key in your browser. Never paste a mainnet key or a key holding real funds.'));
  if (id) {
    body.append(el('p', {}, 'Your site account:'), el('div', { class: 'rp-mono rp-box' }, id.account));
    const fund = el('button', { class: 'rp-btn' }, 'Fund from faucet (10,000 XRD)');
    fund.addEventListener('click', () => run('Funding from faucet…', () => fundFromFaucet(id.privHex, id.account)));
    const reveal = el('button', { class: 'rp-btn rp-btn-ghost' }, 'Reveal key');
    reveal.addEventListener('click', () => { if (confirm('Show your private key? Anyone with it controls this testnet site.')) alert(id.privHex); });
    const out = el('button', { class: 'rp-btn rp-btn-ghost' }, 'Sign out / change key');
    out.addEventListener('click', () => { clearIdentity(); tab = 'account'; render(); });
    body.append(el('div', { class: 'rp-row' }, fund, reveal, out));

    // Directory listing
    body.append(el('h2', {}, 'Public directory'));
    body.append(el('p', { class: 'rp-muted' }, 'List your site on the Radpress home page so others can find it. Costs ~1 XRD (a dust deposit to the directory hub) + fee.'));
    const dirTitle = el('input', { class: 'rp-in', placeholder: 'Display name for your site', maxlength: '100' }) as HTMLInputElement;
    const dirBtn = el('button', { class: 'rp-btn' }, 'Add my site to the directory');
    dirBtn.addEventListener('click', () => {
      const t = dirTitle.value.trim();
      if (!t) return alert('Give your site a display name first.');
      run('Adding to directory…', async () => { await registerSite(id.privHex, id.account, t); alert('Listed in the directory ✓ — it’ll appear on the home page.'); });
    });
    body.append(el('label', {}, 'Site name'), dirTitle, el('div', { class: 'rp-row' }, dirBtn));
    return;
  }
  const gen = el('button', { class: 'rp-btn' }, 'Generate a Stokenet key');
  gen.addEventListener('click', () => useKey(genKeyHex(), true));
  const paste = el('input', { class: 'rp-in rp-mono', placeholder: '…or paste a 64-char hex Stokenet key' }) as HTMLInputElement;
  const usePasted = el('button', { class: 'rp-btn rp-btn-ghost' }, 'Use pasted key');
  usePasted.addEventListener('click', () => { if (!isValidKeyHex(paste.value)) return alert('Need a 64-character hex key.'); useKey(paste.value.trim(), false); });
  body.append(el('p', {}, 'Get a site in two clicks:'), el('div', { class: 'rp-row' }, gen), el('label', {}, 'or bring your own'), el('div', { class: 'rp-row' }, paste, usePasted));
}

async function useKey(privHex: string, generated: boolean) {
  await run('Deriving account…', async () => {
    const account = await deriveAccount(privHex);
    setIdentity({ privHex, account });
  });
  if (generated) alert('Your Stokenet key (SAVE THIS — it is the only way back into your site):\n\n' + privHex);
  tab = 'account'; render();
}

function composeTab(body: HTMLElement) {
  const type = el('select', { class: 'rp-in' }) as HTMLSelectElement;
  for (const t of ['post', 'page', 'profile', 'follows', 'reply']) type.append(el('option', { value: t }, t));
  if (composeSeed.type) type.value = composeSeed.type;
  const path = el('input', { class: 'rp-in', placeholder: '/posts/hello', value: composeSeed.path ?? '' }) as HTMLInputElement;
  const title = el('input', { class: 'rp-in', placeholder: 'Title / name', value: composeSeed.title ?? '' }) as HTMLInputElement;
  const extra = el('input', { class: 'rp-in', placeholder: 'tags (csv) · accounts (csv, follows) · rdx:tx:… (reply)' }) as HTMLInputElement;
  const ta = el('textarea', { class: 'rp-ta', placeholder: '# Markdown…', rows: '12' }) as HTMLTextAreaElement;
  ta.value = composeSeed.body ?? '';
  const preview = el('article', { class: 'rp-content rp-preview' });
  const draw = () => (preview.innerHTML = makeRenderer('preview')(ta.value || '_nothing yet_'));
  ta.addEventListener('input', draw); draw();
  type.addEventListener('change', () => { if (type.value === 'profile') path.value = '/'; if (type.value === 'follows') path.value = '/follows'; });

  const add = el('button', { class: 'rp-btn' }, 'Add to cart');
  add.addEventListener('click', () => {
    const t = type.value; const meta: any = { type: t };
    if (t === 'post' && title.value) meta.title = title.value;
    if (t === 'post') { const tags = extra.value.split(',').map((s) => s.trim()).filter(Boolean); if (tags.length) meta.tags = tags; }
    if (t === 'profile' && title.value) meta.name = title.value;
    if (t === 'follows') meta.accounts = extra.value.split(',').map((s) => s.trim()).filter(Boolean);
    if (t === 'reply') meta.to = extra.value.trim();
    let p = path.value.trim(); if (t === 'profile') p = '/'; if (t === 'follows') p = '/follows';
    if (!p) return alert('Path required.');
    const cart = loadCart(); cart.push({ type: 'publish', path: normalizePath(p), content: makeContent(meta, ta.value) }); saveCart(cart);
    composeSeed = {}; render();
  });
  body.append(el('div', { class: 'rp-compose' },
    el('div', { class: 'rp-form' }, el('label', {}, 'Type'), type, el('label', {}, 'Path'), path, el('label', {}, 'Title / name'), title, el('label', {}, 'Tags / accounts / reply-to'), extra, el('label', {}, 'Body'), ta, add),
    el('div', { class: 'rp-previewwrap' }, el('label', {}, 'Live preview'), preview)));
}

function themeTab(body: HTMLElement, id: Identity | null) {
  body.append(el('p', { class: 'rp-muted' }, 'Edit theme tokens — the whole app previews live. Add to cart to publish an on-ledger theme and set it as your site’s.'));
  const name = el('input', { class: 'rp-in', placeholder: 'Theme name', value: 'My Theme' }) as HTMLInputElement;
  body.append(el('label', {}, 'Name'), name);
  const grid = el('div', { class: 'rp-tokgrid' });
  for (const k of Object.keys(DEFAULT_THEME)) {
    const val = themeDraft[k] || DEFAULT_THEME[k]!;
    const color = el('input', { type: 'color', class: 'rp-color', value: toHexColor(val) }) as HTMLInputElement;
    color.addEventListener('input', () => { themeDraft[k] = color.value; applyTheme(themeDraft); });
    grid.append(el('label', { class: 'rp-tok' }, color, el('span', {}, k)));
  }
  body.append(grid);
  const apply = el('button', { class: 'rp-btn rp-btn-ghost' }, 'Preview');
  apply.addEventListener('click', () => applyTheme(themeDraft));
  const reset = el('button', { class: 'rp-btn rp-btn-ghost' }, 'Reset');
  reset.addEventListener('click', () => { themeDraft = { ...DEFAULT_THEME }; applyTheme(themeDraft); render(); });
  const addBtn = el('button', { class: 'rp-btn' }, 'Add theme to cart');
  addBtn.addEventListener('click', () => {
    if (!id) return alert('Set up an account first (Account tab) so the theme can reference your site.');
    const cart = loadCart();
    cart.push({ type: 'publish', path: '/theme-atom', content: makeContent({ type: 'theme', name: name.value, tokens: themeDraft }, `The ${name.value} theme.`) });
    cart.push({ type: 'publish', path: '/theme', content: makeContent({ type: 'theme-ref', theme: `rdx:page:${id.account}:/theme-atom` }, '') });
    saveCart(cart); render();
  });
  body.append(el('div', { class: 'rp-row' }, apply, reset, addBtn));
}

async function pagesTab(body: HTMLElement, id: Identity | null) {
  if (!id) { body.append(el('p', { class: 'rp-muted' }, 'Set up an account to manage your pages.')); return; }
  const list = el('div', { class: 'rp-pagelist' }, el('p', { class: 'rp-muted' }, 'Loading your pages…'));
  body.append(el('a', { class: 'rp-link', href: `#/s/${encodeURIComponent(id.account)}` }, 'View your public site →'), list);
  try {
    const pages = await getSite(id.account);
    const paths = publishedPaths(pages);
    list.replaceChildren();
    if (!paths.length) { list.append(el('p', { class: 'rp-muted' }, 'No pages yet — compose one.')); return; }
    for (const p of paths) {
      const row = el('div', { class: 'rp-cart-row' }, el('span', { class: 'rp-mono' }, p));
      const del = el('button', { class: 'rp-x' }, 'delete');
      del.addEventListener('click', () => { const cart = loadCart(); cart.push({ type: 'delete', path: p }); saveCart(cart); render(); });
      row.append(del); list.append(row);
    }
  } catch { list.replaceChildren(el('p', { class: 'rp-muted' }, 'Could not load your site yet (nothing published?).')); }
}

function cartPanel(id: Identity | null): HTMLElement {
  const cart = loadCart();
  const panel = el('div', { class: 'rp-cart' }, el('h2', {}, `Cart (${cart.length})`));
  if (busy) panel.append(el('div', { class: 'rp-busy' }, busy));
  for (const [i, a] of cart.entries()) {
    const row = el('div', { class: 'rp-cart-row' }, el('span', { class: 'rp-mono' }, `${a.type} ${a.type === 'redirect' ? a.from + '→' + a.to : a.path}`));
    const rm = el('button', { class: 'rp-x' }, '✕');
    rm.addEventListener('click', () => { const c = loadCart(); c.splice(i, 1); saveCart(c); render(); });
    row.append(rm); panel.append(row);
  }
  if (!cart.length) { panel.append(el('p', { class: 'rp-muted' }, 'Empty. Compose or design a theme, then add it here.')); return panel; }

  const info = el('div', { class: 'rp-checkout' }, 'Estimating…');
  panel.append(info);
  previewCommit(cart).then((pv) => (info.textContent = `${pv.txCount} transaction · ${pv.blobs} blob(s) · head ${pv.headBytes}/2048 B · est. ~${pv.estFee.toFixed(3)} XRD${pv.fits ? '' : '  ⚠ head too big — remove an item'}`));

  const row = el('div', { class: 'rp-row' });
  const publish = el('button', { class: 'rp-btn' }, id ? 'Publish now (sign in-browser)' : 'Set up account to publish');
  if (id) publish.addEventListener('click', () => run('Publishing… (signing in-browser, ~10s)', async () => {
    const tx = await publishCart(id.privHex, id.account, cart);
    saveCart([]); siteBust(id.account);
    alert('Published in one transaction ✓\n' + tx);
  }));
  else publish.addEventListener('click', () => { tab = 'account'; render(); });
  const exp = el('button', { class: 'rp-btn rp-btn-ghost' }, 'Export cart');
  exp.addEventListener('click', () => exportCart(cart));
  const clr = el('button', { class: 'rp-btn rp-btn-ghost' }, 'Clear');
  clr.addEventListener('click', () => { saveCart([]); render(); });
  row.append(publish, exp, clr);
  panel.append(row);
  return panel;
}

function siteBust(_account: string) { /* caches live in data.ts; a reload picks up fresh state */ }

async function run(label: string, fn: () => Promise<unknown>) {
  busy = label; render();
  try { await fn(); } catch (e) { alert('Failed: ' + (e as Error).message); } finally { busy = ''; render(); }
}

function toHexColor(v: string): string {
  const m = v.trim().match(/^#([0-9a-fA-F]{6})/);
  return m ? '#' + m[1] : '#000000';
}
