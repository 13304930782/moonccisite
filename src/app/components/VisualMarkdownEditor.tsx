import { useI18n } from '../i18n';
import {useEffect, useState} from 'react';
import {SimpleEditor, type SimpleEditorProps} from '@/components/tiptap-templates/simple/simple-editor';
import {isRichText,richTextHasContent} from '../lib/richText';
export default function VisualMarkdownEditor(props: SimpleEditorProps) {
  const { t } = useI18n();
 const needsLegacy=!!props.value && !isRichText(props.value);
 const [parseLegacy,setParseLegacy]=useState<((value:string)=>string)>();
 const [failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(!needsLegacy || parseLegacy)return;
  let active=true;setFailed(false);
  import('../lib/legacyEditorContent').then(module=>{if(active)setParseLegacy(()=>module.parseLegacy)}).catch(()=>{if(active)setFailed(true)});
  return()=>{active=false};
 },[needsLegacy,parseLegacy,attempt]);
 if(needsLegacy && !parseLegacy)return failed ? <p role="alert">{t("m_55b4c7f9c1")}<button type="button" onClick={()=>setAttempt(n=>n+1)}>{t("m_b8784c8dd5")}</button></p> : <p role="status">{t("m_84391a2dfe")}</p>;
 const empty=!props.value.trim()||isRichText(props.value)&&!richTextHasContent(props.value);
 return <div className="article-visual-editor" data-empty={empty}><SimpleEditor {...props} parseLegacy={parseLegacy}/></div>;
}
