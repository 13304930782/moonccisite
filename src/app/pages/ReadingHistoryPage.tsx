import { notify } from '../lib/feedback';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {useAdminListQuery} from '../lib/useAdminList';
import {History} from 'lucide-react';
import {api} from '../lib/api';
import {useEngagement} from '../lib/useEngagement';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../components/ui/dialog';
export default function ReadingHistoryPage(){
 const {page,setPage,pageOptions}=useAdminListQuery({});
 const enabled=useEngagement(),[data,setData]=useState<{items:any[];total:number}|null>(null),[prefs,setPrefs]=useState<any>(null),[error,setError]=useState(''),[actionError,setActionError]=useState(''),[busy,setBusy]=useState(''),[loading,setLoading]=useState(true),[confirm,setConfirm]=useState(false),[tick,setTick]=useState(0);
 const request=useRef(0),controller=useRef<AbortController|null>(null),mounted=useRef(true),writeLock=useRef(false),list=useRef<HTMLDivElement>(null),focusAfterRemove=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current++;controller.current?.abort();};},[]);
 const changePage=useCallback((next:number,replace=false)=>setPage(next,{replace}),[setPage]);
 useEffect(()=>{
  if(!enabled)return;const id=++request.current,c=new AbortController();controller.current?.abort();controller.current=c;setLoading(true);setError('');
  Promise.all([api('/engagement/history?page='+page,{signal:c.signal,cache:'no-store'}),api('/engagement/preferences',{signal:c.signal,cache:'no-store'})]).then(([r,p])=>{if(c.signal.aborted||id!==request.current)return;if(r.page&&r.page!==page)changePage(r.page,true);else setData({items:r.items,total:r.total||0});setPrefs(p);}).catch(e=>{if(!c.signal.aborted&&id===request.current)setError(e.message);}).finally(()=>{if(!c.signal.aborted&&id===request.current)setLoading(false);});
  return()=>c.abort();
 },[enabled,page,tick,changePage]);
 useEffect(()=>{if(focusAfterRemove.current){focusAfterRemove.current=false;list.current?.focus({preventScroll:true});}},[data]);
 const act=async(key:string,fn:()=>Promise<any>,apply:()=>void)=>{
  if(writeLock.current)return;writeLock.current=true;setBusy(key);setActionError('');
  try{await fn();if(!mounted.current)return;request.current++;controller.current?.abort();apply();setTick(n=>n+1);}
  catch(e:any){if(mounted.current){setActionError(e.message);notify.error(e.message);}}
  finally{writeLock.current=false;if(mounted.current)setBusy('');}
 };
 const items=data?.items,total=data?.total||0;
 return <section><header className="account-page-heading"><div><span className="account-eyebrow">继续上次阅读</span><h1>阅读历史</h1><p>跨设备保存阅读位置，保留最近 180 天的记录。</p></div><button className="engagement-button" disabled={!items?.length||!!busy} onClick={()=>{setActionError('');setConfirm(true);}}>清空历史</button></header>
 {error&&<p role="alert" className="engagement-alert">{error}<button disabled={loading} onClick={()=>setTick(n=>n+1)}>重试</button></p>}
 {actionError&&!confirm&&<p role="alert" className="engagement-alert">{actionError} 请核对记录后重试。</p>}
 {prefs&&<label className="engagement-panel engagement-toggle"><div><strong>记录阅读进度</strong><small>关闭后停止新增，已有记录可单独清空。</small></div><input type="checkbox" checked={prefs.history_enabled} disabled={!!busy} aria-busy={busy==='preference'} onChange={e=>{const checked=e.target.checked;void act('preference',()=>api('/engagement/preferences',{method:'PUT',body:JSON.stringify({history_enabled:checked})}),()=>setPrefs((current:any)=>({...current,history_enabled:checked})));}}/></label>}
 <div className="engagement-panel" ref={list} tabIndex={-1} aria-label="阅读历史列表" aria-busy={loading||!!busy}>{!enabled?<p>阅读历史尚未启用。</p>:!data?(error?<p>阅读记录暂时无法加载，请使用上方按钮重试。</p>:<p role="status">正在加载记录…</p>):<>{loading&&<p role="status" className="resource-notice">正在更新记录，当前内容仍可查看。</p>}{!items?.length?<div className="engagement-empty"><History size={28}/><h2>从下一篇文章开始</h2><p>登录阅读后，可以在这里继续阅读。</p><Link className="account-primary-button" to="/articles">浏览文章 →</Link></div>:items.map(h=><article className="history-row" key={h.post_id}><div><h2><Link to={'/article/'+h.post_id+'?resume=1'}>{h.title}</Link></h2><p>已读 {Math.round(h.progress*100)}% · {new Date(Number(h.updated_at)).toLocaleString('zh-CN')}</p><progress value={h.progress} max={1}/></div><div className="engagement-actions"><Link to={'/article/'+h.post_id+'?resume=1'}>继续阅读 →</Link><button disabled={!!busy} aria-busy={busy===String(h.post_id)} onClick={event=>{const trigger=event.currentTarget;void act(String(h.post_id),()=>api('/engagement/history/'+h.post_id,{method:'DELETE'}),()=>{focusAfterRemove.current=document.activeElement===trigger;setData(current=>current?{items:current.items.filter(row=>row.post_id!==h.post_id),total:Math.max(0,current.total-(current.items.some(row=>row.post_id===h.post_id)?1:0))}:current);});}}>{busy===String(h.post_id)?'删除中…':'删除'}</button></div></article>)}</>}</div>
 {total>30&&<div className="engagement-pagination"><button disabled={page===1} onClick={event=>setPage(page-1,pageOptions(event?.currentTarget))}>上一页</button><span>第 {page} 页</span><button disabled={page*30>=total} onClick={event=>setPage(page+1,pageOptions(event?.currentTarget))}>下一页</button></div>}
 <Dialog open={confirm} onOpenChange={open=>{if(!writeLock.current)setConfirm(open);}}><DialogContent className="workspace-form-dialog"><DialogTitle>清空阅读历史？</DialogTitle><DialogDescription>所有设备的阅读记录都会清除，文章和收藏不受影响。</DialogDescription>{actionError&&<p role="alert">{actionError}</p>}<button data-dialog-cancel disabled={!!busy} onClick={()=>setConfirm(false)}>取消</button><button className="account-primary-button" disabled={!!busy} aria-busy={busy==='clear'} onClick={()=>void act('clear',()=>api('/engagement/history',{method:'DELETE'}),()=>{setData({items:[],total:0});setConfirm(false);changePage(1,true);})}>{busy==='clear'?'正在清空…':'确认清空'}</button></DialogContent></Dialog>
 </section>;
}
