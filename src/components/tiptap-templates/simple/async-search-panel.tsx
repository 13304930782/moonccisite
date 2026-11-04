import { useI18n } from '../../../app/i18n';
import {useEffect,useState} from 'react';
import type {SearchAndReplaceProps} from '@/components/tiptap-ui/search-and-replace/search-and-replace';
type Panel=typeof import('@/components/tiptap-ui/search-and-replace/search-and-replace')['default'];
export function AsyncSearchPanel(props:SearchAndReplaceProps){
  const { t } = useI18n();
 const [Panel,setPanel]=useState<Panel>(),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;setFailed(false);
  import('@/components/tiptap-ui/search-and-replace/search-and-replace').then(module=>{if(active)setPanel(()=>module.default)}).catch(()=>{if(active)setFailed(true)});
  return()=>{active=false};
 },[attempt]);
 if(Panel)return <Panel {...props}/>;
 if(!props.open)return null;
 return <div className={props.className} role={failed?'alert':'status'} style={{background:'var(--card)',padding:16,border:'1px solid var(--border)',borderRadius:12}}>
  {failed?t("m_16beb5d3a1"):t("m_97743c0f9e")}
  {failed&&<button type="button" onClick={()=>setAttempt(n=>n+1)}>{t("m_b8784c8dd5")}</button>}
  <button type="button" onClick={props.onClose}>{t("m_3fd47edce4")}</button>
 </div>;
}
