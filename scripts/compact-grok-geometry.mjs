// Preserve the original coordinates exactly while avoiding large decimal literals in the bundle.
export function compactGrokGeometry(code) {
  const match = code.match(/(^\s*EXPRESSIONS:\s*)(\[.*\])(,\s*$)/m);
  if (!match) throw new Error('Grok expression geometry was not found');
  const expressions = JSON.parse(match[2]);
  if (!Array.isArray(expressions) || !expressions.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(ring => Array.isArray(ring) && ring.length === 48 && ring.every(point => Array.isArray(point) && point.length === 2 && point.every(value => Number.isFinite(value) && value >= 0 && value <= 655.35 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7))))) throw new Error('Unexpected Grok geometry');
  const values = expressions.flat(3);
  const bytes = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => bytes.writeUInt16LE(Math.round(value * 100), index * 2));
  const encoded = bytes.toString('base64');
  const replacement = `(()=>{const b=atob("${encoded}");let i=0;const n=()=>((b.charCodeAt(i++)|b.charCodeAt(i++)<<8)/100);return Array.from({length:${expressions.length}},()=>Array.from({length:2},()=>Array.from({length:48},()=>[n(),n()])))})()`;
  return code.replace(match[0], match[1] + replacement + match[3]);
}

export function compactGrokGeometryPlugin() {
  return { name: 'compact-grok-geometry', apply: 'build', transform(code, id) {
    if (/[\\/]src[\\/]vendor[\\/]grok-ball[\\/]grok-ball\.js$/.test(id)) return { code: compactGrokGeometry(code), map: null };
  } };
}
