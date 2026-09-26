// Composer helpers + the action cart. The cart is the unit of publishing: every
// action queues locally (localStorage, exportable) and checkout packs them into one
// v1 COMMIT transaction. Export format is exactly what `qd commit <cart.json>` reads.
import { serializePage, buildCommit, Op, Compression, type CommitBuildItem, type FrontMatter } from '@quackdown/core';
import { browserCrypto } from './env.js';

export type CartAction =
  | { type: 'publish'; path: string; note?: string; content: string }
  | { type: 'delete'; path: string; note?: string }
  | { type: 'redirect'; from: string; to: string; note?: string };

const KEY = 'radpress-cart-v1';
export function loadCart(): CartAction[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
export function saveCart(c: CartAction[]) { localStorage.setItem(KEY, JSON.stringify(c)); }

// Stale-cart guard: snapshot the site's state when the cart gets its first item.
export interface CartBaseline { account: string; max: number; byPath: Record<string, number>; }
const BKEY = 'radpress-cart-baseline-v1';
export function loadBaseline(): CartBaseline | null { try { return JSON.parse(localStorage.getItem(BKEY) || 'null'); } catch { return null; } }
export function saveBaseline(b: CartBaseline) { localStorage.setItem(BKEY, JSON.stringify(b)); }
export function clearBaseline() { localStorage.removeItem(BKEY); }

async function cartItems(cart: CartAction[]): Promise<CommitBuildItem[]> {
  const items: CommitBuildItem[] = [];
  for (const a of cart) {
    if (a.type === 'publish') {
      const raw = new TextEncoder().encode(a.content);
      items.push({ op: Op.PUBLISH, path: a.path, note: a.note, bodyBytes: raw, contentHash: await browserCrypto.sha256(raw), compression: Compression.NONE });
    } else if (a.type === 'delete') items.push({ op: Op.DELETE, path: a.path, note: a.note });
    else items.push({ op: Op.REDIRECT, path: a.from, note: a.note, target: a.to });
  }
  return items;
}

// Build a page's full markdown (front-matter + body) from composer fields.
export function makeContent(meta: FrontMatter, body: string): string {
  return serializePage({ v: 1, ...meta }, body);
}

export interface CommitPreview { txCount: number; headBytes: number; fits: boolean; blobs: number; estFee: number; }

export async function previewCommit(cart: CartAction[]): Promise<CommitPreview> {
  const items = await cartItems(cart);
  let headBytes = 0, fits = true, blobCount = 0, blobBytes = 0;
  try { const { head, blobs } = buildCommit(items); headBytes = head.length; blobCount = blobs.length; blobBytes = blobs.reduce((s, b) => s + b.length, 0); }
  catch { fits = false; }
  return { txCount: 1, headBytes, fits, blobs: blobCount, estFee: 0.13 + ((headBytes + blobBytes) / 1024) * 0.1 };
}

export function exportCart(cart: CartAction[]) {
  const blob = new Blob([JSON.stringify(cart, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'radpress-cart.json'; a.click();
  URL.revokeObjectURL(url);
}
