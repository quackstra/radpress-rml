// The active Stokenet publishing identity for the Studio. TESTNET ONLY — this is a
// disposable play key stored in localStorage; never paste a mainnet key or a key
// with real funds. Deriving the address from the key needs RET (see signer.ts).
export interface Identity { privHex: string; account: string; }
const KEY = 'radpress-identity-v1';

export function getIdentity(): Identity | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && v.privHex && v.account ? v : null; } catch { return null; }
}
export function setIdentity(id: Identity) { localStorage.setItem(KEY, JSON.stringify(id)); }
export function clearIdentity() { localStorage.removeItem(KEY); }

export function genKeyHex(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function isValidKeyHex(s: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(s.trim());
}
