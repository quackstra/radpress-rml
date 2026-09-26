// Radpress data layer: reads sites, profiles, posts, replies, follows, themes, and
// the directory DIRECTLY from the Radix ledger via @quackdown/core (resolver +
// Gateway helpers). No indexer — this is the Stokenet MVP read path. Everything is
// verifiable: every item carries the transaction + state version it came from.
import {
  fetchSiteRecords, fetchRawPayload, fetchRegistryRecords, resolveSite, loadBody,
  resolveRegistry, extractBlobs, parsePage, asProfile, asPost, asReply, asFollows, asThemeRef,
  parseRef, ObjectType,
  type ResolvedPage, type PublishOp, type Post, type Reply, type Profile, type RegistryEntry, type ParsedPage,
} from '@quackdown/core';
import { browserCrypto } from './env.js';
import { DEFAULT_THEME, type ThemeTokens } from './theme.js';

const siteCache = new Map<string, Map<string, ResolvedPage>>();
const bodyCache = new Map<string, string>(); // by contentHash
const MAX_PAGES = 60;

export async function getSite(account: string): Promise<Map<string, ResolvedPage>> {
  let pages = siteCache.get(account);
  if (!pages) { pages = (await resolveSite(await fetchSiteRecords(account), browserCrypto)).pages; siteCache.set(account, pages); }
  return pages;
}

export async function materialize(op: PublishOp): Promise<string | null> {
  if (op.content != null) return op.content;
  if (!op.body) return null;
  if (bodyCache.has(op.contentHash)) return bodyCache.get(op.contentHash)!;
  try {
    const content = await loadBody(op.body, extractBlobs(await fetchRawPayload(op.body.txId)), browserCrypto);
    if (content != null) bodyCache.set(op.contentHash, content);
    return content;
  } catch { return null; }
}

export interface PageObj { path: string; tx: string; stateVersion: number; op: PublishOp; parsed: ParsedPage; }

async function objAt(pages: Map<string, ResolvedPage>, path: string): Promise<PageObj | null> {
  const st = pages.get(path)?.state;
  if (!st || st.status !== 'published') return null;
  const content = await materialize(st.op);
  if (content == null) return null;
  return { path, tx: st.op.txId, stateVersion: st.op.stateVersion, op: st.op, parsed: parsePage(content) };
}

export function publishedPaths(pages: Map<string, ResolvedPage>): string[] {
  return [...pages.entries()].filter(([, p]) => p.state.status === 'published').map(([path]) => path)
    .sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));
}

export async function getObject(account: string, path: string): Promise<PageObj | null> {
  return objAt(await getSite(account), path);
}

export async function getProfile(account: string): Promise<{ profile: Profile; obj: PageObj } | null> {
  const obj = await objAt(await getSite(account), '/');
  const profile = obj && asProfile(obj.parsed);
  return profile ? { profile, obj: obj! } : null;
}

export interface PostItem { account: string; path: string; tx: string; stateVersion: number; post: Post; }

export async function listPosts(account: string): Promise<PostItem[]> {
  const pages = await getSite(account);
  const out: PostItem[] = [];
  for (const path of publishedPaths(pages).slice(0, MAX_PAGES)) {
    const o = await objAt(pages, path);
    if (!o || o.parsed.type !== ObjectType.POST) continue;
    const post = asPost(o.parsed);
    if (post) out.push({ account, path, tx: o.tx, stateVersion: o.stateVersion, post });
  }
  return out.sort((a, b) => b.stateVersion - a.stateVersion);
}

export async function getDirectory(): Promise<RegistryEntry[]> {
  return resolveRegistry(await fetchRegistryRecords());
}

export async function getFollows(account: string): Promise<string[]> {
  const o = await objAt(await getSite(account), '/follows');
  return (o && asFollows(o.parsed)?.accounts) || [];
}

export async function getFeed(account: string): Promise<PostItem[]> {
  const follows = await getFollows(account);
  const all: PostItem[] = [];
  for (const acct of follows.slice(0, 20)) all.push(...await listPosts(acct));
  return all.sort((a, b) => b.stateVersion - a.stateVersion);
}

export interface ReplyItem { account: string; path: string; tx: string; stateVersion: number; reply: Reply; }

export async function getReplies(postTx: string, postOpIndex = 0): Promise<ReplyItem[]> {
  const dir = await getDirectory();
  const out: ReplyItem[] = [];
  for (const site of dir.slice(0, 30)) {
    const pages = await getSite(site.account);
    for (const path of publishedPaths(pages).slice(0, MAX_PAGES)) {
      const o = await objAt(pages, path);
      if (!o || o.parsed.type !== ObjectType.REPLY) continue;
      const reply = asReply(o.parsed);
      const ref = reply && parseRef(reply.to);
      if (reply && ref?.kind === 'tx' && ref.tx === postTx && ref.opIndex === postOpIndex) {
        out.push({ account: site.account, path, tx: o.tx, stateVersion: o.stateVersion, reply });
      }
    }
  }
  return out.sort((a, b) => a.stateVersion - b.stateVersion);
}

// Fresh (uncached) snapshot of a site's published paths -> state version, for the
// stale-cart guard.
export async function snapshotSite(account: string): Promise<{ max: number; byPath: Record<string, number> }> {
  const { pages } = await resolveSite(await fetchSiteRecords(account), browserCrypto);
  const byPath: Record<string, number> = {};
  let max = 0;
  for (const [path, p] of pages) {
    if (p.state.status === 'published') { byPath[path] = p.state.op.stateVersion; max = Math.max(max, p.state.op.stateVersion); }
  }
  return { max, byPath };
}

export async function getTheme(account: string): Promise<ThemeTokens> {
  try {
    const prof = await getProfile(account);
    let ref = prof?.profile.theme;
    if (!ref) { const t = await objAt(await getSite(account), '/theme'); if (t) ref = asThemeRef(t.parsed)?.theme; }
    if (!ref) return DEFAULT_THEME;
    const r = parseRef(ref);
    if (r?.kind === 'page') {
      const t = await objAt(await getSite(r.account), r.path);
      const tokens = t && (t.parsed.meta as any).tokens;
      if (tokens && typeof tokens === 'object') return tokens as ThemeTokens;
    }
  } catch { /* default */ }
  return DEFAULT_THEME;
}
