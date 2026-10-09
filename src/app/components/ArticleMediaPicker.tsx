import {Check} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {api} from '../lib/api';
import {safeImageSrc} from '../lib/safeUrl';
export function ArticleMediaPicker({onSelect,onClose,uploadImage,restoreFocus=true}:{onSelect:(url:string,alt:string)=>void;onClose:()=>void;uploadImage?:(file:File)=>Promise<string>;restoreFocus?:boolean}){
 const [q,setQ]=useState(''),[keyword,setKeyword]=useState(''),[page,setPage]=useState(1),[version,setVersion]=useState(0);
 const [data,setData]=useState<any>({items:[],total:0}),[error,setError]=useState(''),[loading,setLoading]=useState(true),[selected,setSelected]=useState<any>(null),[alt,setAlt]=useState('');
 const [uploading,setUploading]=useState(false),[uploadError,setUploadError]=useState(''),[failedFile,setFailedFile]=useState<File|null>(null);
 const heading=useRef<HTMLHeadingElement>(null);
 const alive=useRef(true),chosen=useRef(false),sending=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{const controller=new AbortController();let active=true;setLoading(true);setError('');api(`/upload/media?status=active&page=${page}&pageSize=20&q=${encodeURIComponent(keyword)}`,{signal:controller.signal}).then(r=>{if(active)setData(r);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;controller.abort();};},[keyword,page,version]);
 async function upload(file:File){
  if(sending.current)return;sending.current=true;setUploading(true);setUploadError('');
  try{
   let url:string;
   if(uploadImage)url=await uploadImage(file);
   else{const body=new FormData();body.append('image',file);url=(await api('/upload/image',{method:'POST',body})).url;}
   if(!alive.current)return;
   setSelected({url,filename:url.split('/').pop(),display_name:file.name});setAlt('');setFailedFile(null);setVersion(v=>v+1);
  }catch(e:any){if(alive.current){setUploadError(e.message);setFailedFile(file);}}
  finally{sending.current=false;if(alive.current)setUploading(false);}
 }
 return <Dialog.Root open onOpenChange={v=>{if(!v)onClose();}}><Dialog.Portal><Dialog.Overlay className="article-modal-overlay"/><Dialog.Content className="article-media-dialog" onOpenAutoFocus={e=>{e.preventDefault();heading.current?.focus();}} onCloseAutoFocus={e=>{if(chosen.current&&!restoreFocus)e.preventDefault();}}>
 <header className="media-picker-header"><Dialog.Close>取消</Dialog.Close><Dialog.Title ref={heading} tabIndex={-1}>选择图片</Dialog.Title><button className="media-picker-done" aria-label="使用图片" title="使用图片" disabled={!selected||uploading} onClick={()=>{chosen.current=true;onSelect(selected.url,alt);onClose();}}><Check size={22} aria-hidden="true"/></button></header>
 <Dialog.Description className="sr-only">上传或选择图片，填写替代文本后点右上角确认。</Dialog.Description>
 <div className="media-picker-tools"><form onSubmit={e=>{e.preventDefault();setPage(1);setSelected(null);setKeyword(q.trim());}} className="inline-actions"><input aria-label="搜索图片" maxLength={100} value={q} onChange={e=>setQ(e.target.value)}/><button>搜索</button></form><label className="media-upload-control">{uploading?'正在上传…':'上传图片'}<input aria-label="上传图片" type="file" accept="image/*" disabled={uploading} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value='';}}/></label></div>
 {uploadError&&<div role="alert"><p>{uploadError}</p><button disabled={uploading||!failedFile} onClick={()=>failedFile&&void upload(failedFile)}>重试上传</button></div>}
 {error&&<p role="alert">{error}<button onClick={()=>setVersion(v=>v+1)}>重新加载图片</button></p>}
 <div className="media-picker-scroll">{loading?<p role="status">正在加载图片…</p>:<div className="article-media-grid">{data.items.filter((m:any)=>safeImageSrc(m.url)).map((m:any)=><button key={m.filename} aria-pressed={selected?.filename===m.filename} onClick={()=>{setSelected(m);setAlt(m.alt_text||'');}}><img src={safeImageSrc(m.url)} alt={m.display_name||m.filename}/>{selected?.filename===m.filename&&<span className="media-selection-check" aria-hidden="true"><Check size={16}/></span>}<span>{m.display_name||m.filename}</span>{m.width&&m.height?<small>{m.width} × {m.height}</small>:null}</button>)}{!data.items.length&&<p>没有符合条件的图片。</p>}</div>}
 <div className="inline-actions"><button disabled={page<=1||loading} onClick={()=>{setPage(page-1);setSelected(null);}}>上一页</button><span>{page} / {Math.max(1,Math.ceil(data.total/20))}</span><button disabled={page*20>=data.total||loading} onClick={()=>{setPage(page+1);setSelected(null);}}>下一页</button></div>
 </div><footer className="media-picker-footer"><p className="media-selected-caption" role="status">{selected?`${selected.display_name||selected.filename}${selected.width&&selected.height?` · ${selected.width} × ${selected.height}`:''}`:'尚未选择图片'}</p><label>图片替代文本<input value={alt} onChange={e=>setAlt(e.target.value)} maxLength={500}/></label></footer>
 </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
