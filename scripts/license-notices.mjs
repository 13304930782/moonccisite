import fs from 'node:fs';
// Keep third-party notices in the distributed release, without repeating the
// same icon/package license in dozens of JavaScript chunks.
export function licenseNotices() {
  const notices = new Set();
  return {
    name: 'mooncci-license-notices',
    buildStart() { notices.clear(); },
    renderChunk(code, chunk) {
      for (const match of code.matchAll(/\/\*[\s\S]*?\*\//g)) {
        if (/@license|@preserve|copyright/i.test(match[0])) notices.add(match[0]);
      }
      // The full notices ship once; only entry bundles need the identical index.
      return chunk.isEntry ? { code: '/*! Third-party notices: /THIRD_PARTY_LICENSES.txt */\n' + code, map: null } : null;
    },
    generateBundle() {
      if (!notices.size) throw new Error('Third-party license collection unexpectedly empty');
      const flagLicense = fs.readFileSync('node_modules/country-flag-emoji-polyfill/LICENSE.md', 'utf8');
      const flagCredit = 'Twemoji Country Flags: Twemoji artwork by Twitter, Inc. and contributors (https://github.com/twitter/twemoji), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). The font is the upstream subset supplied by country-flag-emoji-polyfill; no further changes were made.';
      this.emitFile({ type:'asset', fileName:'THIRD_PARTY_LICENSES.txt', source:[...notices,fs.readFileSync('src/components/TIPTAP-LICENSE.txt','utf8'),flagCredit,flagLicense].sort().join('\n\n')+'\n' });
    },
  };
}
