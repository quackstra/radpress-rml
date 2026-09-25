// Browser crypto/zstd adapters injected into @quackdown/core (Web Crypto + fzstd).
import { decompress as zstdDecompress } from 'fzstd';
import type { CryptoDeps } from '@quackdown/core';

export const browserCrypto: CryptoDeps = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', data as unknown as BufferSource));
  },
  async zstdDecompress(data) {
    return zstdDecompress(data);
  },
};
