import hljs from 'highlight.js/lib/core';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import csharp from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import bash from 'highlight.js/lib/languages/bash';
import powershell from 'highlight.js/lib/languages/powershell';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import sql from 'highlight.js/lib/languages/sql';
import php from 'highlight.js/lib/languages/php';
import swift from 'highlight.js/lib/languages/swift';
const languages={c,cpp,javascript,typescript,python,java,csharp,go,rust,bash,powershell,json,yaml,xml,css,sql,php,swift};
for(const [name,grammar] of Object.entries(languages)) hljs.registerLanguage(name,grammar);
const labels:Record<string,string>={c:'C',cpp:'C++',javascript:'JavaScript',typescript:'TypeScript',python:'Python',java:'Java',csharp:'C#',go:'Go',rust:'Rust',bash:'Shell',powershell:'PowerShell',json:'JSON',yaml:'YAML',xml:'HTML / XML',css:'CSS',sql:'SQL',php:'PHP',swift:'Swift'};
const aliases:Record<string,string>={js:'javascript',jsx:'javascript',ts:'typescript',tsx:'typescript',py:'python',sh:'bash',shell:'bash',ps1:'powershell',html:'xml',yml:'yaml',cs:'csharp','c++':'cpp'};
export function highlightCode(source:string,hint='') {
 const requested=hint.toLowerCase(),language=aliases[requested]||requested;
 const plain={html:null,label:requested||'纯文本',automatic:false};
 if(source.length>50000||['text','txt','plaintext','nohighlight'].includes(language))return {...plain,label:'纯文本'};
 try {
  if(language)return hljs.getLanguage(language)?{html:hljs.highlight(source,{language,ignoreIllegals:true}).value,label:labels[language]||language,automatic:false}:plain;
  const result=hljs.highlightAuto(source,Object.keys(languages));
  if(!result.language||result.relevance<3)return {...plain,label:'纯文本'};
  return {html:result.value,label:labels[result.language]||result.language,automatic:true};
 }catch{return plain;}
}
