// In-browser Stokenet signer. Lazy-loads the Radix Engine Toolkit (~3 MB wasm) ONLY
// when the Studio actually publishes, so browsing never pays for it. Signs Quackdown
// v1 transactions with a pasted/generated testnet key. Testnet only.
import { encodeRegister, buildCommit, Op, Compression, MIME_TYPE, NETWORKS, DEFAULT_NETWORK, type CommitBuildItem } from '@quackdown/core';
import { browserCrypto } from './env.js';
import type { CartAction } from './compose.js';

const NETWORK_ID = 2; // Stokenet
const GW = 'https://stokenet.radixdlt.com';
const HUB = NETWORKS[DEFAULT_NETWORK]!.hub;

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
  // Poll /transaction/status: it reports Pending vs Committed vs Rejected with a
  // reason (committed-details only ever returns COMMITTED txs, so a rejected tx
  // there looks like an endless timeout).
  let last = 'Pending';
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    let s;
    try { s = await gw('/transaction/status', { intent_hash: id }); } catch { continue; }
    last = s.intent_status || last;
    if (last === 'CommittedSuccess') return id;
    if (last === 'CommittedFailure' || last === 'PermanentlyRejected')
      throw new Error(`${last}: ${s.error_message || s.intent_status_description || 'transaction rejected by the network'}`);
    // Pending / Unknown / LikelyButNotCertainRejection -> keep waiting
  }
  throw new Error(`still ${last} after 2.5 min — the Gateway may be slow; check the account later`);
}

// Add this account to the public directory: owner-call (lock_fee) proves identity,
// a dust deposit into the hub makes it discoverable, and the REGISTER message names it.
export async function registerSite(privHex: string, account: string, title: string): Promise<string> {
  if ((await xrdBalance(account)) < 2) throw new Error('Fund your account first (Account tab → Fund from faucet).');
  const xrd = (await known()).resources.xrdResource;
  const manifest = [
    `CALL_METHOD Address("${account}") "lock_fee" Decimal("5");`,
    `CALL_METHOD Address("${account}") "withdraw" Address("${xrd}") Decimal("1");`,
    `TAKE_ALL_FROM_WORKTOP Address("${xrd}") Bucket("dust");`,
    `CALL_METHOD Address("${HUB}") "try_deposit_or_abort" Bucket("dust") None;`,
  ].join('\n');
  return submit(privHex, manifest, encodeRegister(title));
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
  // Publishing costs a fee — a brand-new account with 0 XRD will have its lock_fee
  // rejected. Guide the user to fund first instead of failing cryptically.
  if ((await xrdBalance(account)) < 1) {
    throw new Error('This account has no XRD. Go to the Account tab and "Fund from faucet" first.');
  }
  const items: CommitBuildItem[] = [];
  for (const a of cart) {
    if (a.type === 'publish') {
      const raw = new TextEncoder().encode(a.content);
      items.push({ op: Op.PUBLISH, path: a.path, note: a.note, bodyBytes: raw, contentHash: await browserCrypto.sha256(raw), compression: Compression.NONE });
    } else if (a.type === 'delete') {
      items.push({ op: Op.DELETE, path: a.path, note: a.note });
    } else {
      items.push({ op: Op.REDIRECT, path: a.from, note: a.note, target: a.to });
    }
  }
  const { head, blobs } = buildCommit(items); // dedupes identical/empty blobs; throws if head > 2048
  return submit(privHex, `CALL_METHOD Address("${account}") "lock_fee" Decimal("50");`, head, blobs);
}
