// On-ledger theme tokens applied as CSS custom properties. A theme is a Quackdown
// object (type: theme) with a `tokens` map; sites reference one via theme-ref /
// profile.theme. Unknown tokens are ignored; missing ones fall back to the default.
export interface ThemeTokens { [k: string]: string; }

export const DEFAULT_THEME: ThemeTokens = {
  bg: '#0f1216', fg: '#e8eaed', muted: '#9aa4b2', accent: '#ffd23f', card: '#1a1f26', line: '#2a313b', link: '#7cc4ff',
};

const ALLOWED = new Set(Object.keys(DEFAULT_THEME));
const SAFE = /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z0-9 ,.()%#-]+$/; // no url()/expression/;

export function applyTheme(tokens: ThemeTokens | null | undefined) {
  const root = document.documentElement;
  const merged = { ...DEFAULT_THEME, ...(tokens ?? {}) };
  for (const k of ALLOWED) {
    const v = merged[k];
    root.style.setProperty(`--${k}`, v && SAFE.test(v) ? v : DEFAULT_THEME[k]!);
  }
}
