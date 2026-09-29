type Kind = 'success' | 'error';
export type Feedback = { id: string; kind: Kind; message: string; born: number; version: number };
let items: Feedback[] = [];
let version = 0;
const listeners = new Set<() => void>();
function emit() { listeners.forEach(listener => listener()); }
export const feedbackStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  getSnapshot: () => items,
};
export function dismissFeedback(id?: string) {
  items = id ? items.filter(item => item.id !== id) : [];
  emit();
}
function show(kind: Kind, message = '') {
  if (!message.trim()) return;
  const id = `${kind}:${message}`;
  items = [...items.filter(item => item.id !== id).slice(-1), { id, kind, message, born: performance.now(), version: ++version }];
  emit();
}
export const notify = { success: (message: string) => show('success', message), error: (message: string) => show('error', message) };
export function dismissOutsideFeedback() {
  items = items.filter(item => performance.now() - item.born <= 50);
  emit();
}
