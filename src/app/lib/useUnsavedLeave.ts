import {splitLocalePath} from './locale';
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

export function preservesFormNavigation({currentLocation,nextLocation,historyAction}: {currentLocation:{pathname:string;search:string;hash:string};nextLocation:{pathname:string;search:string;hash:string;state?:any};historyAction:string}) {
  if(historyAction!=='REPLACE')return false;
  const current=splitLocalePath(currentLocation.pathname),next=splitLocalePath(nextLocation.pathname);
  if(current.locale!==next.locale&&current.pathname===next.pathname&&currentLocation.search===nextLocation.search)return true;
  const withoutDraft=(search:string)=>{const query=new URLSearchParams(search);query.delete('draft');query.delete('draft_en');query.sort();return query.toString();};
  return nextLocation.state?.mooncciDraftIdentity===true&&currentLocation.pathname===nextLocation.pathname&&currentLocation.hash===nextLocation.hash&&withoutDraft(currentLocation.search)===withoutDraft(nextLocation.search);
}
