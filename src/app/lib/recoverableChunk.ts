const handled = new WeakSet<object>();
export function markChunkErrorHandled(error: unknown) {
  if (error && typeof error === 'object') handled.add(error);
}
export function isChunkErrorHandled(error: unknown) {
  return !!error && typeof error === 'object' && handled.has(error);
}
