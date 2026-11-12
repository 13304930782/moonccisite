import { reducedMotion } from '../lib/motionPreference';

export function ActionProgress({ success = false }: { success?: boolean }) {
  return success ? <span className="action-success" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M4 8.1 6.8 11 12.3 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span> : <span className="action-progress" aria-hidden="true" />;
}
export const waitActionSuccess = () => new Promise<void>(resolve => window.setTimeout(resolve, reducedMotion() ? 0 : 750));
