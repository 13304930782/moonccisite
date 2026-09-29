type Request = { message: string; label: string; resolve: (confirmed: boolean) => void; trigger: HTMLElement | null };
let current: Request | null = null;
const listeners = new Set<() => void>();
export const confirmationStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  getSnapshot: () => current,
};
export function finishConfirmation(confirmed: boolean) {
  const request = current; current = null;
  listeners.forEach(listener => listener());
  request?.resolve(confirmed);
}
export function confirmAction(message: string, label = '确认继续'): Promise<boolean> {
  if (current) return Promise.resolve(false);
  return new Promise(resolve => {
    current = { message, label, resolve, trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null };
    listeners.forEach(listener => listener());
  });
}
