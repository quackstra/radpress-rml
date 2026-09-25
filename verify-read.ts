// Headless check of the Radpress data layer against the seeded Stokenet accounts.
import { getDirectory, getProfile, listPosts, getReplies, getFeed, getTheme } from './src/data.js';

const ALICE = 'account_tdx_2_12yk6sa3pd9zhk8geja39k5azcppeqxcn3yn7pcvq7zet67wchy2azl';
const BOB = 'account_tdx_2_128w3neufp3dd5gwlg6h0tps6gf24wyq35fr3cdyh6lapc9qnlgf6en';

const dir = await getDirectory();
console.log('directory:', dir.length, dir.map((d) => d.title));

const prof = await getProfile(ALICE);
console.log('alice profile:', prof?.profile.name, '| theme ref:', prof?.profile.theme);

const theme = await getTheme(ALICE);
console.log('alice theme accent:', theme.accent);

const posts = await listPosts(ALICE);
console.log('alice posts:', posts.map((p) => p.post.title));

const hello = posts.find((p) => p.path === '/posts/hello')!;
const replies = await getReplies(hello.tx);
console.log('replies to /posts/hello:', replies.length, replies.map((r) => `${r.account.slice(-6)}: ${r.reply.body.slice(0, 30)}`));

const feed = await getFeed(ALICE);
console.log('alice following feed:', feed.map((p) => `${p.account.slice(-6)}/${p.post.title}`));

const ok = dir.length >= 2 && prof?.profile.name === 'Alice on the Ledger' && theme.accent === '#48d597'
  && posts.length >= 2 && replies.length >= 1 && feed.some((p) => p.account === BOB);
console.log(ok ? '\nRADPRESS READ LAYER OK ✅' : '\nRADPRESS READ LAYER FAIL ❌');
if (!ok) process.exit(1);
