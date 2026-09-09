import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export function measureBundle(directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'asset-manifest.json'), 'utf8'));
  const entries = Object.entries(manifest).filter(([, item]) => item.isEntry);
  if (!entries.length) throw Error('No entry found in build manifest');
  const initialJs = new Set(), initialCss = new Set(), visited = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const item = manifest[key];
    if (!item) throw Error(`Missing imported chunk: ${key}`);
    if (item.file.endsWith('.js')) initialJs.add(item.file);
    for (const css of item.css || []) initialCss.add(css);
    // Dynamic imports are measured in total size, not treated as initial requests.
    for (const dependency of item.imports || []) visit(dependency);
  }
  entries.forEach(([key]) => visit(key));
  const js = new Set(fs.readdirSync(directory, { recursive: true }).filter(file => file.endsWith('.js')));
  function sizes(files) {
    const values = [...files].map(file => {
      const resolved = path.resolve(directory, file);
      if (!resolved.startsWith(path.resolve(directory) + path.sep)) throw Error('Invalid manifest path');
      const bytes = fs.readFileSync(resolved);
      return [bytes.length, gzipSync(bytes).length];
    });
    return { raw: values.reduce((sum, v) => sum + v[0], 0), gzip: values.reduce((sum, v) => sum + v[1], 0), max: Math.max(0, ...values.map(v => v[0])) };
  }
  const entry = sizes(initialJs), css = sizes(initialCss), total = sizes(js);
  return { entryJsBytes: entry.raw, entryJsGzipBytes: entry.gzip, entryCssBytes: css.raw,
    entryCssGzipBytes: css.gzip, maxJsChunkBytes: total.max, totalJsBytes: total.raw, totalJsGzipBytes: total.gzip };
}
export function checkBudget(measurements, budget) {
  for (const [key, limit] of Object.entries(budget)) {
    if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(measurements[key])) throw Error(`Invalid budget: ${key}`);
    if (measurements[key] > limit) throw Error(`${key}: ${measurements[key]} bytes exceeds ${limit} bytes`);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = measureBundle(path.resolve('dist'));
  console.log(JSON.stringify(result, null, 2));
  const budget = JSON.parse(fs.readFileSync('bundle-budget.json', 'utf8'));
  for (const key of Object.keys(result)) if (!(key in budget)) throw Error(`Missing budget: ${key}`);
  checkBudget(result, budget);
  console.log('Bundle budgets passed (gzip is computed size, not measured network traffic).');
}
