type Kind = 'success' | 'error';
export type Feedback = { id: string; kind: Kind; message: string; born: number; version: number; shake?: number };
let items: Feedback[] = [];
let version = 0;
let lastShake = { id: '', at: 0, count: 0 };
const listeners = new Set<() => void>();
function emit() { listeners.forEach(listener => listener()); }
export const feedbackStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  getSnapshot: () => items,
};
export function dismissFeedback(id?: string, expectedVersion?: number) {
  items = id ? items.filter(item => item.id !== id || (expectedVersion !== undefined && item.version !== expectedVersion)) : [];
  emit();
}
function show(kind: Kind, message = '', shake = false) {
  if (!message.trim()) return;
  const existing = items.find(item => item.kind === kind && (kind === 'error' || item.message === message));
  const repeated = existing?.message === message;
  const id = existing?.id ?? `feedback:${++version}`;
  const now = performance.now();
  let speed: number | undefined;
  if (shake) {
    speed = repeated && lastShake.id === id && now - lastShake.at < 6000 ? Math.min(3, lastShake.count + 1) : 1;
    lastShake = { id, at: now, count: speed };
  }
  items = [...items.filter(item => item.id !== id && (kind !== 'error' || item.kind !== 'error')).slice(-1), { id, kind, message, born: now, version: ++version, shake: speed }];
  emit();
}
export const notify = { success: (message: string) => show('success', message), error: (message: string, options?: { shake?: boolean }) => show('error', message, options?.shake !== false) };
export function dismissOutsideFeedback() {
  items = items.filter(item => performance.now() - item.born <= 50);
  emit();
}
