import {useEffect,useState} from 'react';
import type {SearchAndReplaceProps} from '@/components/tiptap-ui/search-and-replace/search-and-replace';
type Panel=typeof import('@/components/tiptap-ui/search-and-replace/search-and-replace')['default'];
export function AsyncSearchPanel(props:SearchAndReplaceProps){
 const [Panel,setPanel]=useState<Panel>(),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;setFailed(false);
  import('@/components/tiptap-ui/search-and-replace/search-and-replace').then(module=>{if(active)setPanel(()=>module.default)}).catch(()=>{if(active)setFailed(true)});
  return()=>{active=false};
 },[attempt]);
 if(Panel)return <Panel {...props}/>;
 if(!props.open)return null;
 return <div className={props.className} role={failed?'alert':'status'} style={{background:'var(--card)',padding:16,border:'1px solid var(--border)',borderRadius:12}}>
  {failed?'查找工具加载失败，正文已保留。':'正在加载查找工具…'}
  {failed&&<button type="button" onClick={()=>setAttempt(n=>n+1)}>重试</button>}
  <button type="button" onClick={props.onClose}>关闭</button>
 </div>;
}
