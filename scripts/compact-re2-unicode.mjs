// Losslessly pack the RE2JS Unicode tables at build time. The editor's regex
// implementation and the tables themselves remain unchanged.
const alphabet = Array.from({ length: 94 }, (_, i) => String.fromCharCode(i + 33))
  .filter(c => !['"', "'", '\\', '`', '|', '<', '>'].includes(c)).slice(0, 85).join('');

// Only these ASCII characters may occur inside generated string literals. In
// particular, quotes, backslashes, line breaks and HTML delimiters are absent.
const unsafeLiteralCharacters = /[^!#$%&()*+,\-./0-9:;=?@A-Z\[\]^_a-z{}~]/g;
function safeLiteral(value) {
  const safe = value.replace(unsafeLiteralCharacters, '');
  if (safe !== value) throw new Error('Unsafe RE2 Unicode literal');
  return safe;
}

export function compactRe2Unicode(code) {
  const pattern = /decode(?:Ranges|Orbit)\("([^"\\]+)"/g;
  const tables = [...code.matchAll(pattern)].map(m => m[1]);
  if (tables.length < 200 || tables.some(table => table.includes('|'))) throw new Error('Unexpected RE2JS Unicode tables');
  const text = tables.join('|');
  const positions = new Map(), bytes = [];
  for (let i = 0; i < text.length;) {
    const control = bytes.length; bytes.push(0); let flags = 0;
    for (let bit = 0; bit < 8 && i < text.length; bit++) {
      const candidates = positions.get(text.slice(i, i + 3)) || [];
      let length = 0, distance = 0;
      for (let j = candidates.length - 1; j >= 0 && j > candidates.length - 500; j--) {
        const d = i - candidates[j]; if (d > 65535) break;
        let n = 0; while (n < 255 && i + n < text.length && text[candidates[j] + n] === text[i + n]) n++;
        if (n > length) { length = n; distance = d; }
      }
      const count = length >= 4 ? length : 1;
      if (count > 1) { flags |= 1 << bit; bytes.push(distance >> 8, distance & 255, count); }
      else bytes.push(text.charCodeAt(i));
      for (let p = i; p < i + count; p++) {
        const key = text.slice(p, p + 3); if (!positions.has(key)) positions.set(key, []); positions.get(key).push(p);
      }
      i += count;
    }
    bytes[control] = flags;
  }
  // Validate the exact source text before emitting executable data.
  const decoded = []; let pos = 0;
  while (pos < bytes.length) {
    const flags = bytes[pos++];
    for (let bit = 0; bit < 8 && pos < bytes.length; bit++) {
      if (flags & (1 << bit)) { const distance = bytes[pos++] * 256 + bytes[pos++], count = bytes[pos++]; for (let j = 0; j < count; j++) decoded.push(decoded[decoded.length - distance]); }
      else decoded.push(String.fromCharCode(bytes[pos++]));
    }
  }
  if (decoded.join('') !== text) throw new Error('RE2JS Unicode compression mismatch');
  let encoded = '';
  for (let i = 0; i < bytes.length; i += 4) {
    let n = (((bytes[i] || 0) * 256 + (bytes[i + 1] || 0)) * 256 + (bytes[i + 2] || 0)) * 256 + (bytes[i + 3] || 0);
    let part = ''; for (let j = 0; j < 5; j++) { part = alphabet[n % 85] + part; n = Math.floor(n / 85); } encoded += part;
  }
  let index = 0;
  const result = code.replace(pattern, match => match.slice(0, match.indexOf('"')) + `__mooncciUnicodeTables[${index++}]`);
  const decoder = `const __mooncciUnicodeTables=(()=>{const a="${safeLiteral(alphabet)}",s="${safeLiteral(encoded)}",b=[];for(let i=0;i<s.length;i+=5){let n=0;for(let j=0;j<5;j++)n=n*85+a.indexOf(s[i+j]);b.push(n>>>24,n>>>16&255,n>>>8&255,n&255)}b.length=${bytes.length};let p=0,o=[];while(p<b.length){const f=b[p++];for(let i=0;i<8&&p<b.length;i++){if(f&1<<i){const d=b[p++]*256+b[p++],n=b[p++];for(let j=0;j<n;j++)o.push(o[o.length-d])}else o.push(String.fromCharCode(b[p++]))}}return o.join('').split('|')})();\n`;
  return decoder + result;
}

export function compactRe2UnicodePlugin() {
  return { name: 'compact-re2-unicode', apply: 'build', transform(code, id) {
    if (/[\\/]node_modules[\\/]re2js[\\/]build[\\/]index\.js$/.test(id)) return { code: compactRe2Unicode(code), map: null };
  } };
}
