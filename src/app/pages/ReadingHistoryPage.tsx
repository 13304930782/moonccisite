import { notify } from '../lib/feedback';
import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {History} from 'lucide-react';
import {api} from '../lib/api';
import {useEngagement} from '../lib/useEngagement';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../components/ui/dialog';
export default function ReadingHistoryPage(){
 const [page,setPage]=useState(1),[total,setTotal]=useState(0);
 const enabled=useEngagement(),[items,setItems]=useState<any[]|null>(null),[prefs,setPrefs]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false);
 const load=async()=>{try{const [r,p]=await Promise.all([api('/engagement/history?page='+page),api('/engagement/preferences')]);setItems(r.items);setTotal(r.total||0);if(r.page&&r.page!==page)setPage(r.page);setPrefs(p);setError('');}catch(e:any){setError(e.message);}};
 useEffect(()=>{if(enabled)void load();},[enabled,page]);
 const act=async(fn:()=>Promise<any>)=>{setBusy(true);try{await fn();await load();setConfirm(false);}catch(e:any){setError(e.message); notify.error(e.message);}finally{setBusy(false);}};
 return <section><header className="account-page-heading"><div><span className="account-eyebrow">继续上次阅读</span><h1>阅读历史</h1><p>跨设备保存阅读位置，保留最近 180 天的记录。</p></div><button className="engagement-button" disabled={!items?.length||busy} onClick={()=>setConfirm(true)}>清空历史</button></header>
 {error&&<p role="alert" className="engagement-alert">{error}<button onClick={()=>void load()}>重试</button></p>}
 {prefs&&<label className="engagement-panel engagement-toggle"><div><strong>记录阅读进度</strong><small>关闭后停止新增，已有记录可单独清空。</small></div><input type="checkbox" checked={prefs.history_enabled} disabled={busy} onChange={e=>void act(()=>api('/engagement/preferences',{method:'PUT',body:JSON.stringify({history_enabled:e.target.checked})}))}/></label>}
 <div className="engagement-panel">{!enabled?<p>阅读历史尚未启用。</p>:items===null?<p role="status">正在加载记录…</p>:!items.length?<div className="engagement-empty"><History size={28}/><h2>从下一篇文章开始</h2><p>登录阅读后，可以在这里继续阅读。</p><Link className="account-primary-button" to="/articles">浏览文章 →</Link></div>:items.map(h=><article className="history-row" key={h.post_id}><div><h2><Link to={'/article/'+h.post_id+'?resume=1'}>{h.title}</Link></h2><p>已读 {Math.round(h.progress*100)}% · {new Date(Number(h.updated_at)).toLocaleString('zh-CN')}</p><progress value={h.progress} max={1}/></div><div className="engagement-actions"><Link to={'/article/'+h.post_id+'?resume=1'}>继续阅读 →</Link><button disabled={busy} onClick={()=>void act(()=>api('/engagement/history/'+h.post_id,{method:'DELETE'}))}>删除</button></div></article>)}</div>
 {total>30&&<div className="engagement-pagination"><button disabled={page===1} onClick={()=>setPage(page-1)}>上一页</button><span>第 {page} 页</span><button disabled={page*30>=total} onClick={()=>setPage(page+1)}>下一页</button></div>}
 <Dialog open={confirm} onOpenChange={setConfirm}><DialogContent className="workspace-form-dialog"><DialogTitle>清空阅读历史？</DialogTitle><DialogDescription>所有设备的阅读记录都会清除，文章和收藏不受影响。</DialogDescription><button data-dialog-cancel disabled={busy} onClick={()=>setConfirm(false)}>取消</button><button className="account-primary-button" disabled={busy} onClick={()=>void act(()=>api('/engagement/history',{method:'DELETE'}))}>确认清空</button></DialogContent></Dialog>
 </section>;
}
