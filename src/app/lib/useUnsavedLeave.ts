import { useEffect } from 'react';
type Navigation = { currentLocation: { pathname: string }; nextLocation: { pathname: string } };
const dirtyForms = new Map<symbol, boolean>();
export const hasUnsavedChanges = () => dirtyForms.size > 0;
export const shouldBlockNavigation = ({currentLocation,nextLocation}: Navigation) => [...dirtyForms.values()].some(keepOnSamePage => !keepOnSamePage || currentLocation.pathname !== nextLocation.pathname);
export function useUnsavedLeave(dirty: boolean, keepOnSamePage = false) {
  useEffect(() => {
    if (!dirty) return;
    const id = Symbol('unsaved'); dirtyForms.set(id, keepOnSamePage);
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', unload);
    return () => { dirtyForms.delete(id); window.removeEventListener('beforeunload', unload); };
  }, [dirty, keepOnSamePage]);
}
