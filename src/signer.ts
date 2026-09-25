// In-browser Stokenet signer. Lazy-loads the Radix Engine Toolkit (~3 MB wasm) ONLY
// when the Studio actually publishes, so browsing never pays for it. Signs Quackdown
// v1 transactions with a pasted/generated testnet key. Testnet only.
import { encodeCommit, splitBody, Op, Compression, MIME_TYPE, type CommitSubOp } from '@quackdown/core';
import { browserCrypto } from './env.js';
import type { CartAction } from './compose.js';

const NETWORK_ID = 2; // Stokenet
const GW = 'https://stokenet.radixdlt.com';

let retPromise: Promise<typeof import('@radixdlt/radix-engine-toolkit')> | null = null;
const ret = () => (retPromise ??= import('@radixdlt/radix-engine-toolkit'));

const hex = (u8: Uint8Array) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => Uint8Array.from(h.trim().match(/.{1,2}/g)!.map((x) => parseInt(x, 16)));

async function gw(path: string, body: unknown): Promise<any> {
  const r = await fetch(GW + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gateway ${path} ${r.status}: ${JSON.stringify(j.message ?? j).slice(0, 200)}`);
  return j;
}
const epoch = async () => (await gw('/status/gateway-status', {})).ledger_state.epoch;

let knownP: Promise<any> | null = null;
async function known() {
  const R = await ret();
  return (knownP ??= R.LTSRadixEngineToolkit.Derive.knownAddresses(NETWORK_ID));
}

export async function deriveAccount(privHex: string): Promise<string> {
  const R = await ret();
  const priv = new R.PrivateKey.Ed25519(fromHex(privHex));
  return R.LTSRadixEngineToolkit.Derive.virtualAccountAddress(priv.publicKey(), NETWORK_ID);
}

export async function xrdBalance(account: string): Promise<number> {
  try {
    const xrd = (await known()).resources.xrdResource;
    const d = await gw('/state/entity/details', { addresses: [account], aggregation_level: 'Global' });
    const items = d.items?.[0]?.fungible_resources?.items ?? [];
    return Number(items.find((i: any) => i.resource_address === xrd)?.amount ?? '0');
  } catch { return 0; }
}

async function submit(privHex: string, manifest: string, message?: Uint8Array, blobs: Uint8Array[] = []): Promise<string> {
  const R = await ret();
  const priv = new R.PrivateKey.Ed25519(fromHex(privHex));
  const e = await epoch();
  let step = (await R.TransactionBuilder.new()).header({
    networkId: NETWORK_ID, startEpochInclusive: e, endEpochExclusive: e + 10,
    nonce: await R.generateRandomNonce(), notaryPublicKey: priv.publicKey(), notaryIsSignatory: true, tipPercentage: 0,
  });
  if (message) step = step.message({ kind: 'PlainText', value: { mimeType: MIME_TYPE, message: { kind: 'Bytes', value: message } } });
  const tx = await step.manifest({ instructions: { kind: 'String', value: manifest }, blobs }).notarize(priv);
  const compiled = await R.RadixEngineToolkit.NotarizedTransaction.compile(tx);
  const id = (await R.RadixEngineToolkit.NotarizedTransaction.intentHash(tx)).id;
  await gw('/transaction/submit', { notarized_transaction_hex: hex(compiled) });
  for (let i = 0; i < 40; i++) {
    try { const d = await gw('/transaction/committed-details', { intent_hash: id }); const s = d.transaction?.transaction_status; if (s === 'CommittedSuccess') return id; if (s && s !== 'Pending' && s !== 'Unknown') throw new Error('tx ' + s); } catch (err) { if (String(err).includes('tx ')) throw err; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('timed out waiting for commit');
}

export async function fundFromFaucet(privHex: string, account: string): Promise<string> {
  const faucet = (await known()).components.faucet;
  return submit(privHex, `
CALL_METHOD Address("${faucet}") "lock_fee" Decimal("100");
CALL_METHOD Address("${faucet}") "free";
CALL_METHOD Address("${account}") "try_deposit_batch_or_abort" Expression("ENTIRE_WORKTOP") None;`.trim());
}

// Publish the whole cart as ONE v1 COMMIT transaction, signed in-browser. Bodies are
// stored uncompressed (no zstd encoder in-browser yet — compression stays reserved).
export async function publishCart(privHex: string, account: string, cart: CartAction[]): Promise<string> {
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
  const head = encodeCommit(subOps); // throws if head > 2048 (split the cart)
  return submit(privHex, `CALL_METHOD Address("${account}") "lock_fee" Decimal("50");`, head, blobs);
}
