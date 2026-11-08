import { useI18n } from '../../i18n';
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
  const { t } = useI18n();
 const mobile=useIsBreakpoint()&&compact;
 const [menu,setMenu]=useState(false),[dialog,setDialog]=useState(false),[url,setUrl]=useState(''),[alt,setAlt]=useState(''),[error,setError]=useState(''),[uploading,setUploading]=useState(false);
 const trigger=useRef<HTMLButtonElement>(null),fileInput=useRef<HTMLInputElement>(null),urlInput=useRef<HTMLInputElement>(null),alive=useRef(true),sending=useRef(false),inserted=useRef(false),nextAction=useRef(false),id=useId();
 const current=useRef({onBusy,onInsert,onError});current.current={onBusy,onInsert,onError};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;current.current.onBusy(false);};},[]);
 async function upload(file:File){
  if(disabled||sending.current)return;
  // Match the existing editor's 5 MB limit without eagerly importing its runtime.
  if(file.size>5*1024*1024||file.type&&!file.type.startsWith('image/')){onError(file.size>5*1024*1024?t("m_3802145a33"):t("m_e51a2ecf22"));trigger.current?.focus();return;}
  sending.current=true;setUploading(true);onBusy(true);onError('');
  try{const uploaded=await uploadImage(file);if(alive.current)current.current.onInsert(uploaded,'');}
  catch(error:any){if(alive.current){current.current.onError(error.message||t("m_cc53efbc82"));requestAnimationFrame(()=>{if(alive.current)trigger.current?.focus();});}}
  finally{sending.current=false;if(alive.current){setUploading(false);current.current.onBusy(false);}}
 }
 const choices=[
  {label:t("m_b1a53ac1d4"),run:()=>{queueMicrotask(onMediaLibrary);}},
  {label:t("m_9fbb4750bb"),run:()=>{fileInput.current?.click();}},
  {label:t("m_1ad3caebdf"),run:()=>{inserted.current=false;setUrl('');setAlt('');setError('');setDialog(true);}},
 ];
 const select=(run:()=>void)=>{if(disabled||uploading)return;nextAction.current=true;setMenu(false);run();};
 const imageTrigger=<button ref={trigger} type="button" className={`article-image-trigger${compact?' article-image-trigger-compact':''}`} aria-label={compact?(uploading?t("m_1510220ee7"):t("m_8cc9b8b06e")):undefined} disabled={disabled||uploading} onPointerDown={()=>{nextAction.current=false;}} onKeyDown={()=>{nextAction.current=false;}}><ImagePlus size={compact?22:18} strokeWidth={compact?1.8:2} aria-hidden="true"/>{!compact&&<>{uploading?t("m_6148b38691"):t("m_d24c10d37d")}<ChevronDown size={14} aria-hidden="true"/></>}</button>;
 return <div className="article-image-tools" role="group" aria-label={t("m_78a9dec645")}>
  {mobile?<Sheet open={menu} onOpenChange={setMenu}><SheetTrigger asChild>{imageTrigger}</SheetTrigger><SheetContent side="bottom" className="article-image-sheet ui-v2" onCloseAutoFocus={event=>{if(nextAction.current)event.preventDefault();}}><SheetTitle>{t("m_477a02cebb")}</SheetTitle><SheetDescription className="sr-only">{t("m_23987ba0ef")}</SheetDescription><div className="article-image-sheet-actions">{choices.map(choice=><button key={choice.label} type="button" disabled={disabled||uploading} onClick={()=>select(choice.run)}>{choice.label}</button>)}</div></SheetContent></Sheet>:<DropdownMenu open={menu} onOpenChange={setMenu}><DropdownMenuTrigger asChild>{imageTrigger}</DropdownMenuTrigger>
   <DropdownMenuContent className={`article-image-menu${compact?' ui-v2':''}`} align="start" onCloseAutoFocus={event=>{if(nextAction.current)event.preventDefault();}}>
    {choices.map(choice=><DropdownMenuItem key={choice.label} disabled={disabled||uploading} onSelect={()=>select(choice.run)}>{choice.label}</DropdownMenuItem>)}
   </DropdownMenuContent>
  </DropdownMenu>}
  <input ref={fileInput} className="sr-only" aria-label={t("m_fdd2527d84")} type="file" accept="image/*" tabIndex={-1} disabled={disabled||uploading} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file);}}/>
  {uploading&&<span className={compact?'sr-only':'article-image-progress'} role="status">{t("m_831d255caa")}</span>}
  <Dialog open={dialog} onOpenChange={setDialog}><DialogContent className={`admin-portal article-image-dialog${compact?' ui-v2':''}`} onOpenAutoFocus={event=>{event.preventDefault();urlInput.current?.focus();}} onCloseAutoFocus={event=>{event.preventDefault();if(!inserted.current)trigger.current?.focus();}}>
   <DialogTitle>{t("m_b1659d15cc")}</DialogTitle><DialogDescription>{t("m_40fa8082f7")}</DialogDescription>
   <form onSubmit={event=>{event.preventDefault();if(disabled||uploading)return;const safe=safeImageSrc(url);if(!safe){setError(t("m_1955ee8c25"));urlInput.current?.focus();return;}inserted.current=true;setDialog(false);requestAnimationFrame(()=>{if(alive.current)current.current.onInsert(safe,alt.trim());});}}>
    <label htmlFor={`${id}-url`}>{t("m_f3dbc6bb49")}</label><input ref={urlInput} id={`${id}-url`} value={url} onChange={event=>{setUrl(event.target.value);setError('');}} placeholder={t("m_e88930a346")} aria-invalid={!!error} aria-describedby={error?`${id}-error`:undefined} disabled={disabled||uploading} className={compact ? "ui-input" : undefined}/>
    <label htmlFor={`${id}-alt`}>{t("m_8ed4b1690f")}</label><input id={`${id}-alt`} maxLength={500} value={alt} onChange={event=>setAlt(event.target.value)} disabled={disabled||uploading} className={compact ? "ui-input" : undefined}/>
    {error&&<p id={`${id}-error`} role="alert">{t(error || '')}</p>}
    <div className="article-image-dialog-actions"><DialogClose asChild><AdminButton type="button" variant="ghost" className={compact ?"": undefined}>{t("m_2cd0f3be87")}</AdminButton></DialogClose><AdminButton type="submit" disabled={disabled||uploading} className={compact ?"": undefined}>{t("m_8cc9b8b06e")}</AdminButton></div>
   </form>
  </DialogContent></Dialog>
 </div>;
}
