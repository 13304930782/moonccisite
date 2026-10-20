import {useEffect, useSyncExternalStore, type ComponentType} from 'react';
export type SlotName = 'global' | 'home' | 'logo' | 'hat' | 'footer' | 'page';
const listeners = new Set<() => void>();
let Slot: ComponentType<{name: SlotName}> | null = null;
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function FestivalSlot({name}: {name: SlotName}) {
  const Component = useSyncExternalStore(subscribe, () => Slot, () => null);
  useEffect(() => {
    if (name !== 'global') return;
    let alive = true;
    import('./Runtime').then(module => { if (alive) { Slot = module.default; listeners.forEach(fn => fn()); } }).catch(() => {});
    return () => { alive = false; Slot = null; listeners.forEach(fn => fn()); };
  }, [name]);
  return Component ? <Component name={name}/> : null;
}
