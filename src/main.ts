import { makeRenderer } from './md.js';
import { applyTheme, DEFAULT_THEME } from './theme.js';
import {
  getDirectory, getSite, getProfile, listPosts, getObject, getReplies, getFeed, getFollows,
  publishedPaths, type PostItem,
} from './data.js';
import { ObjectType, asPost, normalizePath } from '@quackdown/core';
import { el, short, chrome } from './dom.js';
import { openStudio } from './studio.js';

const app = document.getElementById('app')!;
function loading(msg = 'Reading the ledger…') { app.replaceChildren(el('div', { class: 'rp-loading' }, msg)); }
function content(site: string, markdown: string): HTMLElement {
  const a = el('article', { class: 'rp-content' });
  a.innerHTML = makeRenderer(site)(markdown);
  return a;
}
function postCard(p: PostItem): HTMLElement {
  const card = el('a', { class: 'rp-postcard', href: `#/s/${encodeURIComponent(p.account)}/${encodeURIComponent(p.path)}` });
  card.append(el('div', { class: 'rp-post-title' }, p.post.title || p.path));
  if (p.post.summary) card.append(el('div', { class: 'rp-post-sum' }, p.post.summary));
  card.append(el('div', { class: 'rp-post-meta' }, `${short(p.account)} · v${p.stateVersion}${p.post.tags?.length ? ' · ' + p.post.tags.map((t) => '#' + t).join(' ') : ''}`));
  return card;
}

// ---- Home: directory + latest posts feed ----
async function home() {
  loading();
  applyTheme(DEFAULT_THEME);
  const main = el('main', { class: 'rp-main' });
  const dir = await getDirectory();
  main.append(el('h1', { class: 'rp-h1' }, 'Radpress'), el('p', { class: 'rp-sub' }, 'Your Radix account is a website. Everything here lives on the ledger.'));

  // latest posts across directory sites
  main.append(el('h2', {}, 'Latest posts'));
  const feed = el('div', { class: 'rp-feed' }, el('div', { class: 'rp-loading' }, 'gathering posts…'));
  main.append(feed);

  main.append(el('h2', {}, `Directory (${dir.length})`));
  const dl = el('div', { class: 'rp-dir' });
  for (const s of dir) {
    const a = el('a', { class: 'rp-dir-item', href: `#/s/${encodeURIComponent(s.account)}` });
    a.append(el('div', { class: 'rp-dir-title' }, s.title || '(untitled site)'), el('div', { class: 'rp-dir-acct' }, short(s.account)));
    dl.append(a);
  }
  main.append(dl);
  app.replaceChildren(chrome(), main);

  const posts: PostItem[] = [];
  for (const s of dir.slice(0, 12)) { try { posts.push(...await listPosts(s.account)); } catch { /* skip */ } }
  posts.sort((a, b) => b.stateVersion - a.stateVersion);
  feed.replaceChildren(...(posts.length ? posts.slice(0, 20).map(postCard) : [el('p', { class: 'rp-muted' }, 'No posts yet.')]));
}

// ---- Site view: themed profile + posts + pages ----
async function site(account: string) {
  loading();
  const [tokensSettled, prof, pages] = await Promise.allSettled([import('./data.js').then((d) => d.getTheme(account)), getProfile(account), getSite(account)]);
  applyTheme(tokensSettled.status === 'fulfilled' ? tokensSettled.value : DEFAULT_THEME);
  const profile = prof.status === 'fulfilled' ? prof.value : null;
  const sitePages = pages.status === 'fulfilled' ? pages.value : new Map();

  const main = el('main', { class: 'rp-main' });
  const head = el('div', { class: 'rp-profile' });
  head.append(el('h1', { class: 'rp-h1' }, profile?.profile.name || short(account)));
  if (profile?.profile.bio) head.append(el('p', { class: 'rp-bio' }, profile.profile.bio));
  head.append(el('div', { class: 'rp-acct' }, account));
  if (profile?.profile.links?.length) {
    const links = el('div', { class: 'rp-links' });
    for (const l of profile.profile.links) links.append(el('a', { href: l.url, rel: 'noopener noreferrer', target: '_blank' }, l.label));
    head.append(links);
  }
  main.append(head);
  if (profile?.obj.parsed.body) main.append(content(account, profile.obj.parsed.body));

  const follows = await getFollows(account).catch(() => []);
  const feedLink = el('a', { class: 'rp-feedlink', href: `#/feed/${encodeURIComponent(account)}` }, `Following feed (${follows.length})`);
  main.append(feedLink);

  const posts = await listPosts(account);
  main.append(el('h2', {}, `Posts (${posts.length})`));
  main.append(el('div', { class: 'rp-feed' }, ...(posts.length ? posts.map(postCard) : [el('p', { class: 'rp-muted' }, 'No posts yet.')])));

  const others = publishedPaths(sitePages).filter((p) => !posts.some((x) => x.path === p) && p !== '/' && p !== '/follows' && p !== '/theme');
  if (others.length) {
    main.append(el('h2', {}, 'Pages'));
    const nav = el('div', { class: 'rp-pagenav' });
    for (const p of others) nav.append(el('a', { class: 'rp-chip', href: `#/s/${encodeURIComponent(account)}/${encodeURIComponent(p)}` }, p));
    main.append(nav);
  }
  app.replaceChildren(chrome(), main);
}

// ---- Page / post view (with replies) ----
async function page(account: string, path: string) {
  loading();
  const tokens = await import('./data.js').then((d) => d.getTheme(account)).catch(() => DEFAULT_THEME);
  applyTheme(tokens);
  const obj = await getObject(account, path);
  const main = el('main', { class: 'rp-main' });
  main.append(el('a', { class: 'rp-back', href: `#/s/${encodeURIComponent(account)}` }, '← ' + short(account)));
  if (!obj) { main.append(el('p', { class: 'rp-muted' }, `Nothing published at ${path}.`)); app.replaceChildren(chrome(), main); return; }

  if (obj.parsed.type === ObjectType.POST) {
    const post = asPost(obj.parsed)!;
    main.append(el('h1', { class: 'rp-h1' }, post.title || path));
    main.append(el('div', { class: 'rp-post-meta' }, `${short(account)} · v${obj.stateVersion}${post.tags?.length ? ' · ' + post.tags.map((t) => '#' + t).join(' ') : ''}`));
    main.append(content(account, post.body));
    const replies = await getReplies(obj.tx, obj.op.opIndex);
    main.append(el('h2', {}, `Replies (${replies.length})`));
    const rl = el('div', { class: 'rp-replies' });
    for (const r of replies) {
      const box = el('div', { class: 'rp-reply' });
      box.append(el('a', { class: 'rp-reply-who', href: `#/s/${encodeURIComponent(r.account)}` }, short(r.account)));
      box.append(content(r.account, r.reply.body));
      rl.append(box);
    }
    main.append(replies.length ? rl : el('p', { class: 'rp-muted' }, 'No replies yet.'));
  } else {
    main.append(content(account, obj.parsed.body));
  }
  app.replaceChildren(chrome(), main);
}

// ---- Follows feed ----
async function feed(account: string) {
  loading();
  applyTheme(DEFAULT_THEME);
  const posts = await getFeed(account);
  const main = el('main', { class: 'rp-main' });
  main.append(el('a', { class: 'rp-back', href: `#/s/${encodeURIComponent(account)}` }, '← ' + short(account)));
  main.append(el('h1', { class: 'rp-h1' }, 'Following feed'));
  main.append(el('div', { class: 'rp-feed' }, ...(posts.length ? posts.map(postCard) : [el('p', { class: 'rp-muted' }, 'This account follows nobody with posts yet.')])));
  app.replaceChildren(chrome(), main);
}

// ---- router ----
function routeParts(): string[] { return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean); }
function route() {
  const p = routeParts();
  if (p[0] === 'studio' || p[0] === 'compose') return void openStudio();
  if (p[0] === 'feed' && p[1]) return void feed(decodeURIComponent(p[1]));
  if (p[0] === 's' && p[1]) {
    const account = decodeURIComponent(p[1]);
    if (p[2]) return void page(account, normalizePath(decodeURIComponent(p[2])));
    return void site(account);
  }
  home();
}
window.addEventListener('hashchange', route);
route();
