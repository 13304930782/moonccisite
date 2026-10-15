import {useEffect,useId,useRef,useState} from 'react';
import {ChevronDown,ImagePlus} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '../ui/dropdown-menu';
import {Dialog,DialogClose,DialogContent,DialogDescription,DialogTitle} from '../ui/dialog';
import {AdminButton} from './AdminButton';
import {safeImageSrc} from '../../lib/safeUrl';
import {Sheet,SheetContent,SheetTitle,SheetDescription,SheetTrigger} from '../ui/sheet';
import {useIsBreakpoint} from '@/hooks/use-is-breakpoint';

type Props={disabled:boolean;onMediaLibrary:()=>void;uploadImage:(file:File)=>Promise<string>;onInsert:(url:string,alt:string)=>void;onError:(message:string)=>void;onBusy:(busy:boolean)=>void;compact?:boolean};
export function ArticleImageMenu({disabled,onMediaLibrary,uploadImage,onInsert,onError,onBusy,compact=false}:Props){
 const mobile=useIsBreakpoint()&&compact;
 const [menu,setMenu]=useState(false),[dialog,setDialog]=useState(false),[url,setUrl]=useState(''),[alt,setAlt]=useState(''),[error,setError]=useState(''),[uploading,setUploading]=useState(false);
 const trigger=useRef<HTMLButtonElement>(null),fileInput=useRef<HTMLInputElement>(null),urlInput=useRef<HTMLInputElement>(null),alive=useRef(true),sending=useRef(false),inserted=useRef(false),nextAction=useRef(false),id=useId();
 const current=useRef({onBusy,onInsert,onError});current.current={onBusy,onInsert,onError};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;current.current.onBusy(false);};},[]);
 async function upload(file:File){
  if(disabled||sending.current)return;
  // Match the existing editor's 5 MB limit without eagerly importing its runtime.
  if(file.size>5*1024*1024||file.type&&!file.type.startsWith('image/')){onError(file.size>5*1024*1024?'图片不能超过 5 MB。':'请选择图片文件。');trigger.current?.focus();return;}
  sending.current=true;setUploading(true);onBusy(true);onError('');
  try{const uploaded=await uploadImage(file);if(alive.current)current.current.onInsert(uploaded,'');}
  catch(error:any){if(alive.current){current.current.onError(error.message||'图片上传失败，请重试。');requestAnimationFrame(()=>{if(alive.current)trigger.current?.focus();});}}
  finally{sending.current=false;if(alive.current){setUploading(false);current.current.onBusy(false);}}
 }
 const choices=[
  {label:'从媒体库选择',run:()=>{queueMicrotask(onMediaLibrary);}},
  {label:'上传图片',run:()=>{fileInput.current?.click();}},
  {label:'插入链接',run:()=>{inserted.current=false;setUrl('');setAlt('');setError('');setDialog(true);}},
 ];
 const select=(run:()=>void)=>{if(disabled||uploading)return;nextAction.current=true;setMenu(false);run();};
 const imageTrigger=<button ref={trigger} type="button" className={`article-image-trigger${compact?' article-image-trigger-compact':''}`} aria-label={compact?(uploading?'正在上传正文图片':'插入图片'):undefined} disabled={disabled||uploading} onPointerDown={()=>{nextAction.current=false;}} onKeyDown={()=>{nextAction.current=false;}}><ImagePlus size={compact?22:18} strokeWidth={compact?1.8:2} aria-hidden="true"/>{!compact&&<>{uploading?'正在上传…':'图片'}<ChevronDown size={14} aria-hidden="true"/></>}</button>;
 return <div className="article-image-tools" role="group" aria-label="正文图片工具">
  {mobile?<Sheet open={menu} onOpenChange={setMenu}><SheetTrigger asChild>{imageTrigger}</SheetTrigger><SheetContent side="bottom" className="article-image-sheet ui-v2" onCloseAutoFocus={event=>{if(nextAction.current)event.preventDefault();}}><SheetTitle>正文图片</SheetTitle><SheetDescription className="sr-only">选择一种方式将图片插入正文。</SheetDescription><div className="article-image-sheet-actions">{choices.map(choice=><button key={choice.label} type="button" disabled={disabled||uploading} onClick={()=>select(choice.run)}>{choice.label}</button>)}</div></SheetContent></Sheet>:<DropdownMenu open={menu} onOpenChange={setMenu}><DropdownMenuTrigger asChild>{imageTrigger}</DropdownMenuTrigger>
   <DropdownMenuContent className={`article-image-menu${compact?' ui-v2':''}`} align="start" onCloseAutoFocus={event=>{if(nextAction.current)event.preventDefault();}}>
    {choices.map(choice=><DropdownMenuItem key={choice.label} disabled={disabled||uploading} onSelect={()=>select(choice.run)}>{choice.label}</DropdownMenuItem>)}
   </DropdownMenuContent>
  </DropdownMenu>}
  <input ref={fileInput} className="sr-only" aria-label="上传正文图片" type="file" accept="image/*" tabIndex={-1} disabled={disabled||uploading} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file);}}/>
  {uploading&&<span className={compact?'sr-only':'article-image-progress'} role="status">正在上传图片…</span>}
  <Dialog open={dialog} onOpenChange={setDialog}><DialogContent className={`admin-portal article-image-dialog${compact?' ui-v2':''}`} onOpenAutoFocus={event=>{event.preventDefault();urlInput.current?.focus();}} onCloseAutoFocus={event=>{event.preventDefault();if(!inserted.current)trigger.current?.focus();}}>
   <DialogTitle>插入图片链接</DialogTitle><DialogDescription>填写图片地址和替代文本，将图片插入当前正文位置。</DialogDescription>
   <form onSubmit={event=>{event.preventDefault();if(disabled||uploading)return;const safe=safeImageSrc(url);if(!safe){setError('请输入有效的图片地址。');urlInput.current?.focus();return;}inserted.current=true;setDialog(false);requestAnimationFrame(()=>{if(alive.current)current.current.onInsert(safe,alt.trim());});}}>
    <label htmlFor={`${id}-url`}>图片地址</label><input ref={urlInput} id={`${id}-url`} value={url} onChange={event=>{setUrl(event.target.value);setError('');}} placeholder="https://… 或 /api/uploads/…" aria-invalid={!!error} aria-describedby={error?`${id}-error`:undefined} disabled={disabled||uploading} className={compact ? "ui-input" : undefined}/>
    <label htmlFor={`${id}-alt`}>图片替代文本</label><input id={`${id}-alt`} maxLength={500} value={alt} onChange={event=>setAlt(event.target.value)} disabled={disabled||uploading} className={compact ? "ui-input" : undefined}/>
    {error&&<p id={`${id}-error`} role="alert">{error}</p>}
    <div className="article-image-dialog-actions"><DialogClose asChild><AdminButton type="button" variant="ghost" className={compact ? "ui-btn ui-btn--ghost" : undefined}>取消</AdminButton></DialogClose><AdminButton type="submit" disabled={disabled||uploading} className={compact ? "ui-btn ui-btn--solid" : undefined}>插入图片</AdminButton></div>
   </form>
  </DialogContent></Dialog>
 </div>;
}
