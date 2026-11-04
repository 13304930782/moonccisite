import {useRef,useState} from 'react';
import {useI18n} from '../i18n';
import {useResource,ResourceState} from '../components/ContentUI';
import {TranslationFields} from '../components/ContentTranslationEditor';
import {AdminButton} from '../components/admin/AdminButton';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../components/ui/dialog';
import {confirmAction} from '../lib/confirmAction';
import '../../styles/admin-taxonomy.css';

type Kind='category'|'tag';
export default function AdminTaxonomyPage(){
 const {t}=useI18n();const [kind,setKind]=useState<Kind>('category'),[query,setQuery]=useState('');
 const [selected,setSelected]=useState<{kind:Kind;name:string}|null>(null);
 const [editor,setEditor]=useState({dirty:false,busy:false});const closing=useRef(false);
 const resource=useResource(kind==='category'?'/posts/meta/categories':'/posts/meta/tags');
 const names=(resource.data||[]).map((row:any)=>String(row[kind]||'')).filter((name:string)=>name&&name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 async function close(){if(editor.busy||closing.current)return;closing.current=true;try{if(!editor.dirty||await confirmAction(t('m_eafbe4976e'),t('m_ef804eda90')))setSelected(null);}finally{closing.current=false;}}
 return <div className="admin-page taxonomy-page ui-v2"><header className="taxonomy-heading"><h1>{t('m_3fcdff8677')}</h1><p>{t('m_990db6cde1')}</p></header>
  <div className="taxonomy-tabs" role="group" aria-label={t('m_3fcdff8677')}>
   {(['category','tag'] as const).map(value=><button key={value} type="button" aria-pressed={kind===value} onClick={()=>{setKind(value);setQuery('');}}>{t(value==='category'?'分类':'标签')}</button>)}
  </div>
  <label className="taxonomy-search">{t('m_25e504f565')}<input type="search" value={query} onChange={event=>setQuery(event.target.value)}/></label>
  <ResourceState resource={resource}>{resource.data&&<>{names.length?<ul className="taxonomy-list">{names.map((name:string)=><li key={name}><span lang="zh-CN">{name}</span><AdminButton type="button" variant="soft" aria-label={t('m_87a97cd2b5',{name})} onClick={()=>{setEditor({dirty:false,busy:false});setSelected({kind,name});}}>{t('m_0518365699')}</AdminButton></li>)}</ul>:<p className="taxonomy-empty">{t(query?'没有匹配的名称。':'暂无分类或标签。')}</p>}</>}</ResourceState>
  <Dialog open={!!selected} onOpenChange={open=>{if(!open)void close();}}><DialogContent className="admin-portal taxonomy-translations taxonomy-dialog"><DialogTitle>{t('m_754cc547a0')}</DialogTitle><DialogDescription><span lang="zh-CN">{selected?.name}</span></DialogDescription>
   {selected&&<TranslationFields key={selected.kind+':'+selected.name} type={selected.kind} id={selected.name} source={{name:selected.name}} onStateChange={setEditor}/>}
  </DialogContent></Dialog>
 </div>;
}
