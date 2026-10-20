import {Component, useEffect, useSyncExternalStore, type ComponentType, type ReactNode} from 'react';
import {useLocation} from 'react-router-dom';
import {api} from '../../lib/api';
import type {SlotName} from './Entry';
import {installTheme,environment,type FestivalEnvironment,type ThemeEffects} from './lifecycle';
type Active = {id:string; label:string; windowLabel:string; level:string; options:Record<string,boolean>};
type Theme = ComponentType<{name:string; options:Record<string,boolean>; environment:FestivalEnvironment}>;
const modules: Record<string, () => Promise<{default:Theme;theme:ThemeEffects}>> = {halloween: () => import('../Halloween/Decorations')};
const previewKey = 'mooncci-festival-preview';
const listeners = new Set<() => void>();
const empty = {active:null as Active|null, Theme:null as Theme|null, off:false, preview:false, effects:null as ThemeEffects|null};
let state = empty;
const subscribe = (fn: () => void) => { listeners.add(fn); return () => {listeners.delete(fn);}; };
function publish(next: typeof state) { state = next; listeners.forEach(fn => fn()); }
function preference(id:string) { return `mooncci-${id}`; }
const preferences = new Map<string,boolean>();
function readOff(id:string) { if (preferences.has(id)) return preferences.get(id)!; try {return localStorage.getItem(preference(id)) === 'off';} catch {return false;} }
function clearPreview() { try {sessionStorage.removeItem(previewKey);} catch {} window.dispatchEvent(new Event('mooncci:festival-preview')); }
class SafeTheme extends Component<{children:ReactNode},{failed:boolean}> {
  state = {failed:false};
  static getDerivedStateFromError() {return {failed:true};}
  render() {return this.state.failed ? null : this.props.children;}
}
function start() {
  let closed = false, generation = 0, timer: ReturnType<typeof setTimeout>, controller: AbortController;
  const refresh = async () => {
    const version = ++generation;
    clearTimeout(timer); controller?.abort(); controller = new AbortController();
    let preview: {festivalId:string; at:string; expiresAt:number}|null = null;
    try {preview = JSON.parse(sessionStorage.getItem(previewKey) || 'null');} catch {}
    if (preview && (!Number.isFinite(preview.expiresAt) || preview.expiresAt <= Date.now())) {try {sessionStorage.removeItem(previewKey);} catch {} preview = null;}
    let delay = 60000;
    const requestedAt = performance.now();
    try {
      const result = await api(preview ? '/settings/festivals/preview' : '/settings/festivals/active', {
        method:preview ? 'POST' : 'GET', readOnly:true, cache:'no-store', signal:controller.signal,
        ...(preview ? {body:JSON.stringify({festivalId:preview.festivalId,at:preview.at})} : {}),
      });
      if (closed || version !== generation) return;
      const active:Active|null = result.active;
      delay = preview ? Math.min(60000,preview.expiresAt-Date.now()) : Math.min(60000,Date.parse(result.nextCheckAt)-Date.parse(result.serverTime));
      const off = active ? readOff(active.id) : false;
      let Theme:Theme|null = null, effects:ThemeEffects|null = null;
      if (active && modules[active.id] && !off) {
        // Remove the previous theme before waiting for a different module.
        if (state.active?.id !== active.id) publish({...empty,preview:!!preview});
        const loaded = await modules[active.id](); Theme = loaded.default; effects = loaded.theme;
      }
      if (!closed && version === generation) publish({active,Theme,off,preview:!!preview,effects});
    } catch {
      if (!closed && version === generation) publish({...empty,preview:!!preview});
    } finally {
      if (!closed && version === generation) timer = setTimeout(refresh,Number.isFinite(delay) ? Math.max(100,delay-(performance.now()-requestedAt)) : 60000);
    }
  };
  const visible = () => {if (!document.hidden) void refresh();};
  const storage = (event:StorageEvent) => {if (!event.key || event.key === preference(state.active?.id || '')) {preferences.clear();void refresh();}};
  const events = ['site-settings-updated','mooncci:festivals-updated','mooncci:festival-preview'];
  events.forEach(event => window.addEventListener(event,refresh));
  window.addEventListener('storage',storage); document.addEventListener('visibilitychange',visible);
  void refresh();
  return () => {closed = true;generation++;clearTimeout(timer);controller?.abort();events.forEach(event => window.removeEventListener(event,refresh));window.removeEventListener('storage',storage);document.removeEventListener('visibilitychange',visible);publish(empty);};
}
const buttonStyle = {font:'inherit',color:'inherit',background:'transparent',border:0,minHeight:44,padding:'0 4px'};
export default function Slot({name}: {name:SlotName}) {
  const current = useSyncExternalStore(subscribe,() => state,() => empty);
  const {pathname} = useLocation();
  useEffect(() => name === 'global' ? start() : undefined,[name]);
  const {active,Theme,off,preview,effects} = current;
  useEffect(() => {
    if (name !== 'global' || !effects || off) return;
    try {return installTheme(effects,!!active?.options.favicon);} catch {publish(empty);}
  },[name,effects,off,active?.options.favicon]);
  if (name === 'global' && preview) return <><aside aria-label="节日预览" style={{position:'fixed',bottom:16,left:16,zIndex:1000,padding:'0 12px',borderRadius:12,background:'var(--background)',color:'var(--foreground)',boxShadow:'0 2px 12px #0003',fontSize:13}}>仅当前标签页预览 · {active?.label || '无装饰'} <button type="button" className="quiet-button" onClick={clearPreview}>退出预览</button></aside>{Theme && active && !off && <SafeTheme key={active.id}><Theme name="global" options={active.options} environment={environment}/></SafeTheme>}</>;
  if (!active) return null;
  if (name === 'footer') return <div data-halloween={active.id === 'halloween' ? 'footer' : undefined} className="festival-controls" style={{fontSize:12,color:'var(--muted-foreground)',marginTop:12}}>
    <style>{'.festival-controls button:focus-visible{outline:2px solid var(--primary);outline-offset:2px}'}</style>
    {active.windowLabel ? `装饰仅在 ${active.windowLabel.replace(/\d{4}-(\d+)-(\d+)/g,(_,m,d) => `${Number(m)} 月 ${Number(d)} 日`).replace(' — ','至 ')}显示` : `${active.label}装饰`} · <button type="button" style={buttonStyle} onClick={() => {preferences.set(active.id,!off);try {localStorage.setItem(preference(active.id),off ? 'on' : 'off');} catch {} publish({...current,off:!off});window.dispatchEvent(new Event('mooncci:festivals-updated'));}}>{off ? '开启节日装饰' : '关闭节日装饰'}</button>
  </div>;
  const option = ({logo:'header',hat:'hat',home:'home',page:'pageAccent'} as Partial<Record<SlotName,string>>)[name];
  if (off || !Theme || (option && !active.options[option]) || (name === 'page' && (pathname === '/' || /^\/(admin|account|login|register)/.test(pathname)))) return null;
  const decoration = <SafeTheme key={active.id+JSON.stringify(active.options)}><Theme name={name} options={active.options} environment={environment}/></SafeTheme>;
  return name === 'page' ? <div style={{display:'flex',justifyContent:'center',margin:'12px 0',pointerEvents:'none'}}>{decoration}</div> : decoration;
}
