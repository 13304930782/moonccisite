import {useEffect, useState} from 'react';
import {SimpleEditor, type SimpleEditorProps} from '@/components/tiptap-templates/simple/simple-editor';
import {isRichText} from '../lib/richText';
export default function VisualMarkdownEditor(props: SimpleEditorProps) {
 const needsLegacy=!!props.value && !isRichText(props.value);
 const [parseLegacy,setParseLegacy]=useState<((value:string)=>string)>();
 const [failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(!needsLegacy || parseLegacy)return;
  let active=true;setFailed(false);
  import('../lib/legacyEditorContent').then(module=>{if(active)setParseLegacy(()=>module.parseLegacy)}).catch(()=>{if(active)setFailed(true)});
  return()=>{active=false};
 },[needsLegacy,parseLegacy,attempt]);
 if(needsLegacy && !parseLegacy)return failed ? <p role="alert">旧正文转换器加载失败。<button type="button" onClick={()=>setAttempt(n=>n+1)}>重试</button></p> : <p role="status">正在加载旧正文…</p>;
 return <SimpleEditor {...props} parseLegacy={parseLegacy}/>;
}
