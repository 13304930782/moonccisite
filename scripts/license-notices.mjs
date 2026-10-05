import fs from 'node:fs';
// Keep third-party notices in the distributed release, without repeating the
// same icon/package license in dozens of JavaScript chunks.
export function licenseNotices() {
  const notices = new Set();
  return {
    name: 'mooncci-license-notices',
    buildStart() { notices.clear(); },
    renderChunk(code) {
      for (const match of code.matchAll(/\/\*[\s\S]*?\*\//g)) {
        if (/@license|@preserve|copyright/i.test(match[0])) notices.add(match[0]);
      }
      return null;
    },
    generateBundle() {
      if (!notices.size) throw new Error('Third-party license collection unexpectedly empty');
      this.emitFile({ type:'asset', fileName:'THIRD_PARTY_LICENSES.txt', source:[...notices,fs.readFileSync('src/components/TIPTAP-LICENSE.txt','utf8')].sort().join('\n\n')+'\n' });
    },
  };
}
