// Preserve the original coordinates exactly while avoiding large decimal literals in the bundle.
export function compactGrokGeometry(code) {
  const match = code.match(/(^\s*EXPRESSIONS:\s*)(\[.*\])(,\s*$)/m);
  if (!match) throw new Error('Grok expression geometry was not found');
  const expressions = JSON.parse(match[2]);
  if (!Array.isArray(expressions) || !expressions.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(ring => Array.isArray(ring) && ring.length === 48 && ring.every(point => Array.isArray(point) && point.length === 2 && point.every(value => Number.isFinite(value) && value >= 0 && value <= 655.35 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7))))) throw new Error('Unexpected Grok geometry');
  const values = expressions.flat(3);
  const integers = values.map(value => Math.round(value * 100));
  const bytes = [];
  integers.forEach((value, index) => {
    const prediction = index >= 4 ? 2 * integers[index - 2] - integers[index - 4] : index >= 2 ? integers[index - 2] : 0;
    const delta = value - prediction;
    let encoded = delta < 0 ? -2 * delta - 1 : 2 * delta;
    while (encoded > 127) { bytes.push((encoded & 127) | 128); encoded = Math.floor(encoded / 128); }
    bytes.push(encoded);
  });
  const encoded = Buffer.from(bytes).toString('base64');
  const replacement = `(()=>{const b=atob("${encoded}");let i=0,k=0,x=0,y=0,dx=0,dy=0;const n=(v,d)=>{let z=0,s=0,c;do{c=b.charCodeAt(i++);z|=(c&127)<<s;s+=7}while(c&128);return v+d+(z&1?-(z+1)/2:z/2)};return Array.from({length:${expressions.length}},()=>Array.from({length:2},()=>Array.from({length:48},()=>{const a=n(x,dx),c=n(y,dy);dx=k?a-x:0;dy=k?c-y:0;k++;x=a;y=c;return[x/100,y/100]})))})()`;
  return code.replace(match[0], match[1] + replacement + match[3]);
}

export function compactGrokGeometryPlugin() {
  return { name: 'compact-grok-geometry', apply: 'build', transform(code, id) {
    if (/[\\/]src[\\/]vendor[\\/]grok-ball[\\/]grok-ball\.js$/.test(id)) return { code: compactGrokGeometry(code), map: null };
  } };
}
