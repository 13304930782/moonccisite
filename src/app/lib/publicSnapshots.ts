// Session-local published data only. Generations reject late invalidated reads.
const snapshots = new Map<string, { data: any; time: number }>();
const subscribers = new Set<() => void>();
let generation = 0;
export const snapshotGeneration = () => generation;
export function readSnapshot(path: string) {
  const entry = snapshots.get(path);
  if (!entry || Date.now() - entry.time >= 30000) { snapshots.delete(path); return null; }
  return entry.data;
}
export function writeSnapshot(path: string, data: any, started: number) {
  if (generation !== started) return;
  snapshots.delete(path);
  if (snapshots.size >= 40) snapshots.delete(snapshots.keys().next().value!);
  snapshots.set(path, {data, time: Date.now()});
}
export function clearPublicSnapshots() { generation++; snapshots.clear(); subscribers.forEach(fn => fn()); }
export function subscribeSnapshotInvalidation(fn: () => void) { subscribers.add(fn); return () => { subscribers.delete(fn); }; }

export function deleteSnapshot(path: string) { snapshots.delete(path); }
