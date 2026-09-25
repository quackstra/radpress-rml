// Composer helpers + the action cart. The cart is the unit of publishing: every
// action queues locally (localStorage, exportable) and checkout packs them into one
// v1 COMMIT transaction. Export format is exactly what `qd commit <cart.json>` reads.
import { serializePage, encodeCommit, splitBody, Op, Compression, type CommitSubOp, type FrontMatter } from '@quackdown/core';
import { browserCrypto } from './env.js';

export type CartAction =
  | { type: 'publish'; path: string; note?: string; content: string }
  | { type: 'delete'; path: string; note?: string }
  | { type: 'redirect'; from: string; to: string; note?: string };

const KEY = 'radpress-cart-v1';
export function loadCart(): CartAction[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
export function saveCart(c: CartAction[]) { localStorage.setItem(KEY, JSON.stringify(c)); }

// Build a page's full markdown (front-matter + body) from composer fields.
export function makeContent(meta: FrontMatter, body: string): string {
  return serializePage({ v: 1, ...meta }, body);
}

export interface CommitPreview { txCount: number; headBytes: number; fits: boolean; blobs: number; estFee: number; }

export async function previewCommit(cart: CartAction[]): Promise<CommitPreview> {
  const subOps: CommitSubOp[] = [];
  const blobs: Uint8Array[] = [];
  for (const a of cart) {
    if (a.type === 'publish') {
      const raw = new TextEncoder().encode(a.content);
      const parts = splitBody(raw);
      subOps.push({ op: Op.PUBLISH, path: a.path, note: a.note, contentHash: await browserCrypto.sha256(raw), compression: Compression.NONE, blobStart: blobs.length, blobCount: parts.length });
      blobs.push(...parts);
    } else if (a.type === 'delete') {
      subOps.push({ op: Op.DELETE, path: a.path, note: a.note });
    } else {
      subOps.push({ op: Op.REDIRECT, path: a.from, note: a.note, target: a.to });
    }
  }
  let headBytes = 0, fits = true;
  try { headBytes = encodeCommit(subOps).length; } catch { fits = false; }
  const totalBytes = headBytes + blobs.reduce((s, b) => s + b.length, 0);
  return { txCount: 1, headBytes, fits, blobs: blobs.length, estFee: 0.13 + (totalBytes / 1024) * 0.1 };
}

export function exportCart(cart: CartAction[]) {
  const blob = new Blob([JSON.stringify(cart, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'radpress-cart.json'; a.click();
  URL.revokeObjectURL(url);
}
