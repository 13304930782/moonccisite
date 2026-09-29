import { useEffect } from 'react';
const dirtyForms = new Set<symbol>();
export const hasUnsavedChanges = () => dirtyForms.size > 0;
export function useUnsavedLeave(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const id = Symbol('unsaved'); dirtyForms.add(id);
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', unload);
    return () => { dirtyForms.delete(id); window.removeEventListener('beforeunload', unload); };
  }, [dirty]);
}
