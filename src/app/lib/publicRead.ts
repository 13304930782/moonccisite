import { snapshotGeneration } from './publicSnapshots';
import { api, ApiError } from './api';
// Only the published endpoints already eligible for public snapshots may share work.
export const publicReadPath = (path: string) => /^\/posts(?:\?|$)/.test(path) || /^\/posts\/meta\/(?:categories|tags)(?:\?|$)/.test(path) || /^\/(now|activity|projects|updates)(?:\?|$|\/[\w-]+(?:\?|$))/.test(path);
type Flight = { promise: Promise<any>; controller: AbortController; readers: number; done: boolean };
const flights = new Map<string, Flight>();
export function publicRead(path: string, signal: AbortSignal) {
  if (!publicReadPath(path)) return api(path, { signal });
  if (signal.aborted) return Promise.reject(new ApiError('请求已取消。', 0, 'cancelled'));
  const key = `${snapshotGeneration()}:${path}`;
  let flight = flights.get(key);
  if (!flight) {
    // Bound metadata even when a page starts many different requests.
    if (flights.size >= 40) return api(path, { signal });
    const controller = new AbortController();
    flight = { controller, readers: 0, done: false, promise: Promise.resolve() };
    const entry = flight;
    flight.promise = api(path, { signal: controller.signal }).finally(() => {
      entry.done = true;
      if (flights.get(key) === entry) flights.delete(key);
    });
    flights.set(key, flight);
  }
  const entry = flight; entry.readers++;
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error: unknown, value?: unknown) => {
      if (done) return; done = true;
      signal.removeEventListener('abort', cancel); entry.readers--;
      queueMicrotask(() => {
        if (!entry.done && entry.readers === 0) {
          if (flights.get(key) === entry) flights.delete(key);
          entry.controller.abort();
        }
      });
      if (error) reject(error); else resolve(value);
    };
    const cancel = () => finish(new ApiError('请求已取消。', 0, 'cancelled'));
    signal.addEventListener('abort', cancel, { once: true });
    entry.promise.then(value => finish(null, value), error => finish(error));
  });
}
