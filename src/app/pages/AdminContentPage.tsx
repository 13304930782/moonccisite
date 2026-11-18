import '../../styles/admin-projects.css';
import {flushSync} from 'react-dom';
import {AdminEmpty, AdminNotice} from '../components/admin/AdminState';
import '../../styles/admin-updates.css';
import {ContentTranslationEditor} from '../components/ContentTranslationEditor';
import { useI18n } from '../i18n';
import { useContentListQuery } from '../lib/useContentListQuery';
import '../../styles/admin-settings-layout.css';
import '../../styles/admin-newsletter.css';
import '../../styles/admin-newsletter-polish.css';
import '../../styles/admin-ui-v2.css';
import { AdminButton } from '../components/admin/AdminButton';
import { notify } from '../lib/feedback';
import { confirmAction } from '../lib/confirmAction';
import {useUnsavedLeave} from '../lib/useUnsavedLeave';

import {Link} from '../components/LocaleLink';
import { ThemeSelect } from '../components/ThemeSelect';
import { Fragment, FormEvent, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import {
  PageHeading,
  Pagination,
  ResourceState,
  formatDate,
  labels,
  useResource,
} from '../components/ContentUI';
import { MarkdownContent } from '../components/MarkdownContent';
import { safeImageSrc } from '../lib/safeUrl';
import { projectIcon } from '../lib/projectBrand';
import { ArrowLeft, Image as ImageIcon } from 'lucide-react';
import '../../styles/project-images.css';
import { NewsletterPreview } from '../components/admin/NewsletterPreview';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';

function ImageField({
  value,
  onChange,
  onBusy,
  label = '配图地址',
  description,
  previewSrc,
  icon = false,
  project = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onBusy?: (v:boolean)=>void;
  label?: string;
  description?: string;
  previewSrc?: string;
  icon?: boolean;
  project?: boolean;
}) {
  const { locale,  t } = useI18n();
  const [open, setOpen] = useState(false),
    [images, setImages] = useState<any[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(()=>{onBusy?.(busy);},[busy,onBusy]);
  async function library() {
    setBusy(true);
    try {
      setImages(await api('/upload/media'));
      setOpen(true);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append('image', file);
      const r = await api('/upload/image', { method: 'POST', body });
      onChange(r.url);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const mediaLibrary = open && <div className="image-field-library">
    <div className="image-field-library-heading"><strong>{t('媒体库')}</strong><button type="button" onClick={() => setOpen(false)}>{t("m_d3f1640aed")}</button></div>
    {!images.length && <p className="muted">{t('媒体库还没有图片，可以先上传一张。')}</p>}
    <div className="media-picker">
      {images.map(img => <button type="button" key={img.filename} onClick={() => { onChange(img.url); setOpen(false); }}>
        <img src={safeImageSrc(img.url)} alt={img.alt_text || img.filename} />
        <small title={img.display_name || img.filename}>{img.display_name || img.filename}</small>
      </button>)}
    </div>
  </div>;
  const image = safeImageSrc(previewSrc ?? value);
  return <section className={`image-field project-image-field${icon ? ' image-field--icon' : ''}`} aria-label={t(String(label))} aria-busy={busy}>
    <header className="project-image-heading">
      <h3>{t(String(label))}</h3>
      {description&&<p>{description}</p>}
    </header>
    <div className="project-image-content">
      <div className={`project-image-preview${icon ? ' project-image-preview--icon' : ''}`}>
        {image ? <img src={image} alt={icon ? t("m_f04c0c8e40") : t("m_64814a7c00")} /> : <><ImageIcon size={24} aria-hidden="true" /><span>{t("m_5cc85c2fce")}</span></>}
      </div>
      <div className="project-image-actions">
        <label className="project-image-upload" aria-disabled={busy}>
            {busy ? t("m_d3d21191f3") : image ? (icon ? t("m_ea9fbf028a") : project ? t("m_138d69a5ca") : t("m_d1e4bfccf0")) : t("m_9fbb4750bb")}
          <input type="file" aria-label={project ? (icon ? t("m_e130b5f543") : t("m_f315326eef")) : t("m_20afa916ec")} accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy}
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file); }} />
        </label>
        <button type="button" disabled={busy} onClick={library}>{t("m_b1a53ac1d4")}</button>
        {(value || previewSrc) && <button type="button" className="project-image-remove" disabled={busy} onClick={() => onChange('')}>{icon ? t("m_ba73b35b44") : t("m_92fa07eb4b")}</button>}
      </div>
    </div>
    <details className="project-image-url">
      <summary>{t("m_f50757280f")}</summary>
      <label>{t(String(label))}<input value={value} disabled={busy} onChange={event => onChange(event.target.value)} placeholder={t("m_07f6b91c58")} /></label>
    </details>
    {mediaLibrary}
    {error && <p className="project-image-error" role="alert">{t(error || '')}</p>}
  </section>;
}
export function AdminUpdatesPage() {
  const {t,formatDate,locale}=useI18n();const {page,setPage}=useContentListQuery();
  const resource=useResource(`/admin/updates?page=${page}`);
  const empty={id:0,content:'',image_url:'',status:'draft'};
  const [form,rawSetForm]=useState<any>(empty),[editing,setEditing]=useState(false),[dirty,setDirty]=useState(false);
  const [imageBusy,setImageBusy]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [translation,setTranslation]=useState({dirty:false,busy:false});const newButton=useRef<HTMLButtonElement>(null);const leaving=useRef(false);const saving=useRef(false);
  useUnsavedLeave(dirty||translation.dirty);
  const setForm=(value:any)=>{rawSetForm(value);setDirty(true);};
  const open=(item?:any)=>{rawSetForm(item?{...item}:{...empty});setDirty(false);setMessage('');setTranslation({dirty:false,busy:false});setEditing(true);};
  const finish=()=>{setEditing(false);setDirty(false);setTranslation({dirty:false,busy:false});rawSetForm({...empty});requestAnimationFrame(()=>newButton.current?.focus());};
  async function back(){if(busy||imageBusy||translation.busy||leaving.current)return;leaving.current=true;try{if(!dirty&&!translation.dirty||await confirmAction(t('m_d87119f6cc')))finish();}finally{leaving.current=false;}}
  async function save(event:FormEvent){
    event.preventDefault();if(saving.current||busy||imageBusy||translation.busy||resource.loading||resource.error)return;
    saving.current=true;
    if(translation.dirty&&!await confirmAction(t('m_a0731c0410'))){saving.current=false;return;}
    setBusy(true);setMessage('');
    try{await api(form.id?`/admin/updates/${form.id}`:'/admin/updates',{method:form.id?'PUT':'POST',body:JSON.stringify(form)});flushSync(finish);notify.success(t('m_5c4bcec56b'));if(!form.id&&page!==1)setPage(1);else resource.reload();}
    catch(error:any){setMessage(error.message);}finally{saving.current=false;setBusy(false);}
  }
  return <div className="content-admin content-admin--updates">
    {editing?<>
      <button type="button" className="updates-back" disabled={busy||imageBusy||translation.busy} onClick={()=>void back()}><ArrowLeft size={16} aria-hidden="true"/>{t('m_337c99f1e5')}</button>
      <PageHeading back={false} title={t(form.id?'m_d7f953ad34':'m_e66fd484b3')}/>
      {(resource.loading||resource.error)&&<ResourceState resource={resource}>{null}</ResourceState>}
      <form className="editor-panel updates-editor" onSubmit={save}>
        <fieldset disabled={busy||translation.busy}>
          <label className="updates-body-field">{t('m_94d0d085d8')}<textarea required rows={6} maxLength={10000} value={form.content} onChange={event=>setForm({...form,content:event.target.value})}/></label>
          <ImageField onBusy={setImageBusy} value={form.image_url} onChange={image_url=>setForm((previous:any)=>({...previous,image_url}))}/>
          <div className="updates-publication"><label>{t('m_5100f029e0')}<ThemeSelect aria-label={t('m_5100f029e0')} value={form.status} onValueChange={status=>setForm({...form,status})}><option value="draft">{t('m_9719f2fcd5')}</option><option value="published">{t('m_70cff5ab60')}</option></ThemeSelect></label></div>
          <details className="updates-preview"><summary>{t('m_9b5078da24')}</summary><div className="updates-preview-body"><MarkdownContent content={form.content}/>{safeImageSrc(form.image_url)&&<img src={safeImageSrc(form.image_url)} alt=""/>}</div></details>
          {message&&<p role="alert" className="updates-error">{t(message)}</p>}
          <div className="updates-save-actions"><button type="submit" className="updates-save" disabled={busy||imageBusy||translation.busy||resource.loading||!!resource.error}>{t(busy?'m_ff509c9ba0':'m_64508ac540')}</button><button type="button" disabled={busy||imageBusy||translation.busy} onClick={()=>void back()}>{t('m_4b29ce8e40')}</button></div>
        </fieldset>
      </form>
      {form.id>0&&<fieldset className="updates-translation" disabled={busy}><ContentTranslationEditor type="update" id={form.id} source={form} onStateChange={setTranslation}/></fieldset>}
    </>:<>
      <header className="updates-list-heading"><PageHeading back={false} title={t('m_010469b6ab')}/><button ref={newButton} type="button" className="updates-save" onClick={()=>open()}>{t('m_345e6bf024')}</button></header>
      <p className="muted updates-list-hint">{t('m_8dfe391a50')}{' '}<Link className="text-link" to="/admin/site-settings#now">{t('m_7d1212d4b8')}</Link>{t('m_6a2ef51435')}</p>
      <ResourceState resource={resource}>{resource.data&&<>{resource.data.items.length?<div className="admin-records updates-records">{resource.data.items.map((item:any)=><article key={item.id}>
        {safeImageSrc(item.image_url)&&<img className="updates-record-image" src={safeImageSrc(item.image_url)} alt="" loading="lazy"/>}
        <div className="updates-record-copy"><div className="updates-record-meta"><span className="admin-status-chip">{t(labels[item.status])}</span><time dateTime={item.published_at||item.created_at}>{formatDate(item.published_at||item.created_at)}</time></div><p>{item.content.slice(0,160)}</p></div>
        <button type="button" onClick={()=>open(item)}>{locale==='en'?'Edit':t('编辑')}</button>
      </article>)}</div>:<div className="admin-empty-result"><AdminEmpty title={t('m_7ef5934699')} hint={t('m_a165885777')} action={<button type="button" className="quiet-button" onClick={()=>open()}>{t('m_345e6bf024')}</button>}/></div>}<Pagination data={resource.data} onPage={setPage}/></>}</ResourceState>
    </>}
  </div>;
}
const emptyProject = {
  id: 0,
  name: '',
  slug: '',
  summary: '',
  content: '',
  cover_image: '',
  icon_image: null,
  tech_stack: '',
  stage: 'building',
  status: 'draft',
  demo_url: '',
  repo: '',
  featured_rank: '',
};
export function AdminProjectsPage() {
  const {locale,t}=useI18n();const {user}=useAuth();const owner=user?.role==='owner';
  const {page,setPage}=useContentListQuery();const resource=useResource(`/admin/projects?page=${page}`);
  const [clock,setClock]=useState(Date.now());useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const [form,rawSetForm]=useState<any>({...emptyProject}),[editing,setEditing]=useState(false),[dirty,setDirty]=useState(false);
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState<number|null>(null);
  const [translation,setTranslation]=useState({dirty:false,busy:false});const [busyImages,setBusyImages]=useState({cover:false,icon:false});
  const pending=useRef(false),leaving=useRef(false),newButton=useRef<HTMLButtonElement>(null),releaseButton=useRef<HTMLButtonElement|null>(null);
  const imageBusy=busyImages.cover||busyImages.icon;useUnsavedLeave(dirty||translation.dirty);
  const coverBusy=useCallback((value:boolean)=>setBusyImages(previous=>previous.cover===value?previous:{...previous,cover:value}),[]);
  const iconBusy=useCallback((value:boolean)=>setBusyImages(previous=>previous.icon===value?previous:{...previous,icon:value}),[]);
  const setForm=(value:any)=>{rawSetForm(value);setDirty(true);};
  function open(item?:any){rawSetForm(item?{...emptyProject,...item,featured_rank:item.featured_rank??''}:{...emptyProject});setMessage('');setDirty(false);setTranslation({dirty:false,busy:false});setSelected(null);setEditing(true);}
  function finish(){setEditing(false);setDirty(false);setTranslation({dirty:false,busy:false});rawSetForm({...emptyProject});requestAnimationFrame(()=>newButton.current?.focus());}
  async function back(){if(pending.current||imageBusy||translation.busy||leaving.current)return;leaving.current=true;try{if(!dirty&&!translation.dirty||await confirmAction(t('m_d87119f6cc')))finish();}finally{leaving.current=false;}}
  async function action(path:string,method:string,body?:any){
    if(pending.current||imageBusy||translation.busy||resource.loading||resource.error)return false;
    pending.current=true;setBusy(true);setMessage('');
    try{const result=await api(path,{method,body:body?JSON.stringify(body):undefined});notify.success(result.message||t('m_db8102ba6e'));resource.reload();return true;}
    catch(error:any){setMessage(error.message);return false;}finally{pending.current=false;setBusy(false);}
  }
  async function save(event:FormEvent){
    event.preventDefault();if(pending.current||imageBusy||translation.busy||resource.loading||resource.error)return;
    pending.current=true;setBusy(true);
    try{
      if(translation.dirty&&!await confirmAction(t('m_a0731c0410')))return;
      setMessage('');const creating=!form.id;
      await api(form.id?`/admin/projects/${form.id}`:'/admin/projects',{method:form.id?'PUT':'POST',body:JSON.stringify(form)});
      flushSync(finish);notify.success(t('作品已保存。'));if(creating&&page!==1)setPage(1);else resource.reload();
    }catch(error:any){setMessage(error.message);}finally{pending.current=false;setBusy(false);}
  }
  return <div className="content-admin content-admin--projects">
    {editing?<>
      <button type="button" className="projects-back" disabled={busy||imageBusy||translation.busy} onClick={()=>void back()}><ArrowLeft size={16} aria-hidden="true"/>{t('m_8788e94748')}</button>
      <PageHeading back={false} title={t(form.id?'m_ebe85a9290':'m_668ca27393')}/>
      {(resource.loading||resource.error)&&<ResourceState resource={resource}>{null}</ResourceState>}
      <form className="editor-panel projects-editor" onSubmit={save}>
        <fieldset disabled={busy||translation.busy}><section className="projects-section"><h2>{t('m_e8df058725')}</h2>
        <div className="form-grid">
          {[
            ['name', t("m_35c0869550"), 160],
            ['slug', t("m_341338a20a"), 160],
            ['demo_url', t("m_9858520f59"), 500],
            ['repo', t("m_8706015e1c"), 200],
          ].map(([key, label, max]) => (
            <label key={key}>
              {t(String(label))}
              <input
                name={String(key)}
                required={key === 'name' || key === 'slug'}
                maxLength={Number(max)}
                disabled={key === 'repo' && !owner}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
              {key==='repo'&&!owner&&<small className="muted">{t('仅站长可修改同步仓库。')}</small>}
            </label>
          ))}
        </div>
        </section><section className="projects-section"><h2>{t('m_7a68830642')}</h2><label>
           {t("m_8131eafd02")} <textarea
            required
            name="summary" rows={3}
            maxLength={2000}
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
        </label>
        <label>{t('m_265b45019e')}<input name="tech_stack" maxLength={1000} value={form.tech_stack} onChange={event=>setForm({...form,tech_stack:event.target.value})}/></label>
        <label>
           {t("m_a213c3ece0")} <textarea
            name="content" rows={8}
            maxLength={50000}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
        </label>
        </section><section className="projects-section"><h2>{t('m_d24c10d37d')}</h2><div className="project-image-settings">
        <ImageField onBusy={iconBusy} icon project
          value={form.icon_image ?? ''}
          previewSrc={projectIcon(form)}
          onChange={(icon_image) => setForm((previous:any) => ({ ...previous, icon_image }))}
          label={t("m_d767823d1d")}
          description={t("m_3bf9be1508")}
        />
        <ImageField onBusy={coverBusy} project
          value={form.cover_image}
          onChange={(cover_image) => setForm((previous:any) => ({ ...previous, cover_image }))}
          label={t("m_315cd7b482")}
          description={t("m_0ee6b9e133")}
        />
        </div>
        </section><section className="projects-section"><h2>{t('m_aab87b8683')}</h2><div className="form-grid">
          <label>
             {t("m_5faa30fb29")} <ThemeSelect aria-label={t("m_5faa30fb29")}
              value={form.stage}
              onValueChange={(nextValue) =>
                setForm({ ...form, stage: nextValue })
              }
            >
              {['building', 'active', 'maintenance', 'archived'].map((s) => (
                <option key={s} value={s}>
                  {t(labels[s])}
                </option>
              ))}
            </ThemeSelect>
          </label>
          <label>
             {t("m_5100f029e0")} <ThemeSelect aria-label={t("m_5100f029e0")}
              value={form.status}
              onValueChange={(nextValue) =>
                setForm({ ...form, status: nextValue })
              }
            >
              <option value="draft">{t("m_9719f2fcd5")}</option>
              <option value="published">{t("m_70cff5ab60")}</option>
            </ThemeSelect>
          </label>
        </div>
        <label>{t("m_3c266a59ab")}<input name="featured_rank" maxLength={4} value={form.featured_rank} onChange={event=>setForm({...form,featured_rank:event.target.value})}/></label></section>
        {message&&<p role="alert" className="projects-error">{t(message)}</p>}
        <div className="inline-actions projects-save-actions">
          <button className="project-save" disabled={busy||imageBusy||translation.busy||resource.loading||!!resource.error}>{t(busy?'m_ff509c9ba0':'m_e7205525f5')}</button>
          <button type="button" disabled={busy||imageBusy||translation.busy} onClick={()=>void back()}>{t('m_4b29ce8e40')}</button>
        </div></fieldset>
      </form>
      {form.id>0&&<fieldset className="projects-translation" disabled={busy}><ContentTranslationEditor type="project" id={form.id} source={form} onStateChange={setTranslation}/></fieldset>}
    </>:<>
      <header className="projects-list-heading"><PageHeading back={false} title={t('m_831ed48e52')}>{t('管理作品介绍、展示图片与发布状态。')}</PageHeading>
        <div className="projects-list-actions"><Popover><PopoverTrigger asChild><button type="button" className="projects-help-trigger">{t('同步说明')}</button></PopoverTrigger><PopoverContent align="end" collisionPadding={16} className="admin-portal projects-sync-help"><h2>{t('同步说明')}</h2><p>{t('m_6d1b4ca522')}{resource.data?.syncConfigured?t('m_8a4ef3e48e'):t('m_1133e57f65')}{t('m_9048c71183')}</p></PopoverContent></Popover>
        <button ref={newButton} type="button" className="project-save" disabled={busy} onClick={()=>open()}>{t('m_668ca27393')}</button></div>
      </header>
      {message&&<p role="alert" className="projects-error">{t(message)}</p>}
      <ResourceState resource={resource}>
        {resource.data && (
          <>
            {!resource.data.items.length?<div className="admin-empty-result"><AdminEmpty title={t('m_9c8012c713')} hint={t('m_feceffc6dd')}/></div>:<div className="admin-records projects-records">
              {resource.data.items.map((p: any) => (
                <Fragment key={p.id}><article>
                  <div className="projects-record-copy">
                    <div className="projects-record-title">{projectIcon(p)&&<img src={projectIcon(p)} alt=""/>}<h3>{p.name}</h3></div>
                    <div className="projects-record-meta"><span className="admin-status-chip">{t(labels[p.status])}</span><span>{t(labels[p.stage])}</span></div>
                    {p.summary&&<p className="projects-record-summary">{p.summary}</p>}
                    {p.sync_error && <p className="projects-error" role="alert">{t(p.sync_error)}</p>}
                  </div>
                  <div className="inline-actions projects-record-actions">
                    <button type="button" onClick={()=>open(p)} disabled={busy}>{t('m_ebe85a9290')}</button>
                    <button type="button" disabled={busy} aria-expanded={selected===p.id} onClick={event=>{releaseButton.current=event.currentTarget;setSelected(selected===p.id?null:p.id);}}>{t('管理版本')}</button>
                  </div>
                  <details className="projects-record-sync"><summary><span className="projects-sync-status">{t('版本同步')}<strong>{p.sync_enabled?t('m_8a4ef3e48e'):t('m_6744b4c6a9')}</strong></span><span className="projects-sync-toggle"><span className="projects-sync-open-label">{t('同步设置')}</span><span className="projects-sync-close-label">{t('收起设置')}</span></span></summary>
                    <div className="projects-sync-body"><p className="muted">{t('m_84100b718c')} {p.last_success_at?new Date(p.last_success_at).toLocaleString(locale,{timeZone:'Asia/Shanghai'}):t('m_439e864e83')}</p>
                      {p.next_attempt_at&&Date.parse(p.next_attempt_at)>clock&&<p className="muted">{t('m_2fd9849216')}{new Date(p.next_attempt_at).toLocaleString(locale,{timeZone:'Asia/Shanghai'})}</p>}
                      {owner&&<div className="inline-actions">
                        <button type="button" disabled={busy||imageBusy||resource.loading||!!resource.error} onClick={()=>action(`/admin/projects/${p.id}/sync`,'PUT',{enabled:!p.sync_enabled})}>{p.sync_enabled?t('m_c1490d9ff9'):t('m_0aa086572f')}</button>
                        <button type="button" disabled={busy||!p.sync_enabled||resource.loading||!!resource.error||(p.next_attempt_at&&Date.parse(p.next_attempt_at)>clock)} onClick={()=>action(`/admin/projects/${p.id}/sync`,'POST')}>{p.next_attempt_at&&Date.parse(p.next_attempt_at)>clock?Math.ceil((Date.parse(p.next_attempt_at)-clock)/1000)+t('m_d7050e5034'):t('m_36e7a43a1c')}</button>
                      </div>}
                    </div>
                  </details>
                </article>
                {selected===p.id&&<ReleaseManager key={p.id} id={p.id} onClose={()=>{setSelected(null);requestAnimationFrame(()=>releaseButton.current?.focus());}}/>}</Fragment>
              ))}
            </div>}
            <Pagination data={resource.data} onPage={setPage} />
          </>
        )}
      </ResourceState>
    </>}
  </div>;
}
function ReleaseManager({ id, onClose }: { id: number; onClose: () => void }) {
  const { locale,  t } = useI18n();
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus({preventScroll:true});},[]);
  const [page, setPage] = useState(1),
    r = useResource(`/admin/projects/${id}/releases?page=${page}`),
    [error, setError] = useState(''),
    [busyId, setBusyId] = useState<number | null>(null);
  async function hide(release: any) {
    if (busyId !== null) return;
    setBusyId(release.id);
    setError('');
    try {
      await api(`/admin/releases/${release.id}`, {
        method: 'PUT',
        body: JSON.stringify({ hidden: !release.hidden }),
      });
      r.reload();
      notify.success(release.hidden ? t("m_5c3799f1f3") : t("m_73e60ca4a7"));
    } catch (e: any) {
      setError(e.message);
    } finally { setBusyId(null); }
  }
  return (
    <section className="editor-panel projects-releases">
      <div className="section-heading">
        <h2 ref={heading} tabIndex={-1}>{t("m_79b622b8f8")}</h2>
        <button type="button" onClick={onClose}>{t("m_3fd47edce4")}</button>
      </div>
      {error&&<p role="alert" className="projects-error">{t(error)}</p>}
      <ResourceState resource={r}>
        {r.data && (
          <>
            <div className="admin-records">
              {!r.data.items.length && <div className="quiet-state"><h3>{t("m_28e3bc0d86")}</h3><p>{t("m_0dfbbeca4f")}</p></div>}
              {r.data.items.map((item: any) => (
                <article key={item.id}>
                  <div>
                    <h3>{item.title}</h3>
                    <small>
                      {item.repo} · {item.hidden ? t("m_1f1bc0d510") : t("m_41417f490b")} ·{' '}
                      {item.historical ? t("m_c8c9686c6f") : t("m_82bda02e90")}
                    </small>
                  </div>
                  <button disabled={busyId !== null || r.loading} onClick={() => hide(item)}>
                    {busyId === item.id ? t("m_e6442ce18f") : item.hidden ? t("m_142d98f2cd") : t("m_145219e726")}
                  </button>
                </article>
              ))}
            </div>
            <Pagination data={r.data} onPage={setPage} />
          </>
        )}
      </ResourceState>
    </section>
  );
}
export function AdminNewsletterPage() {
  const { locale,  t , formatDate} = useI18n();
  const [section, setSection] = useState('draft');
  const [page, setPage] = useState(1),
    r = useResource(`/admin/newsletter?page=${page}`),
    [subPage, setSubPage] = useState(1),
    sub = useResource(`/admin/subscribers?page=${subPage}`),
    preview = useResource('/admin/newsletter/preview'),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function put(path: string, body: any) {
    setBusy(true);
    setMessage('');
    try {
      await api(path, { method: 'PUT', body: JSON.stringify(body) });
      notify.success(t("m_bd03c0aad7"));
      r.reload();
      sub.reload();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="content-admin newsletter-admin ui-v2">
      <header className="newsletter-page-heading"><h1 className="admin-title">{t("m_87594d4a43")}</h1><p>{t('管理每周内容、投递记录和订阅者。')}</p></header>
      {message&&<AdminNotice>{t(message)}</AdminNotice>}
      <ResourceState resource={r}>
        {r.data && (
          <>
            <section className="newsletter-overview" aria-labelledby="newsletter-overview-title">
              <div className="newsletter-overview-heading">
                <div><h2 id="newsletter-overview-title">{t("m_8dffc16214")}</h2><p className="newsletter-schedule">{t("m_e8d61e9429")}</p></div>
                <span className="newsletter-status" role="status"><span aria-hidden="true" />{t(!r.data.deliveryConfigured ? '服务器投递未启用' : r.data.enabled ? '周报已启用' : '周报已暂停')}</span>
              </div>
              <p className="newsletter-description">{t("m_62b9b76eea")}</p>
              {!r.data.deliveryConfigured && <AdminNotice kind="info">
                <strong>{t('启用服务器投递后才能开启周报')}</strong>
                <p>{t('先检查邮件与任务服务，完成配置后重新检查。')}</p>
                <div className="newsletter-actions">
                  <AdminButton asChild variant="soft"><Link to="/admin/mail-settings">{t("m_3739038fa7")}</Link></AdminButton>
                  <AdminButton asChild variant="soft"><Link to="/admin/runtime">{t("m_74ad4dbcf0")}</Link></AdminButton>
                  <AdminButton type="button" variant="soft" onClick={r.reload} disabled={r.loading}>{t('重新检查')}</AdminButton>
                </div>
                <details className="newsletter-config"><summary>{t('服务器配置说明')}</summary><p>{t("m_b33a7717ae")}</p></details>
              </AdminNotice>}
              <div className="newsletter-overview-footer">
                <AdminButton type="button" variant={r.data.enabled ? 'soft' : 'solid'} disabled={busy || (!r.data.deliveryConfigured && !r.data.enabled)} onClick={() => put('/admin/newsletter', { enabled: !r.data.enabled })}>
                  {busy ? t('m_ff509c9ba0') : r.data.enabled ? t("m_864b8d3731") : t("m_7e0e58cf82")}
                </AdminButton>
                <div className="newsletter-counts">
                  {r.data.counts.map((c: any) => <p key={c.status}><strong>{c.total}</strong><span>{c.status === 'active' ? t("m_62b43de9d3") : t(labels[c.status])}</span></p>)}
                </div>
              </div>
            </section>
            <div className="newsletter-navigation" role="group" aria-label={t("m_87594d4a43")}>
              <button type="button" aria-pressed={section === 'draft'} aria-controls="newsletter-draft" onClick={() => setSection('draft')}>{t("m_0fe12d0e21")}</button>
              <button type="button" aria-pressed={section === 'delivery'} aria-controls="newsletter-delivery" onClick={() => setSection('delivery')}>{t("m_f0c5fa02c9")}</button>
              <button type="button" aria-pressed={section === 'subscribers'} aria-controls="newsletter-subscribers" onClick={() => setSection('subscribers')}>{t("m_1d8f926772")}</button>
            </div>
            <section id="newsletter-draft" hidden={section !== 'draft'} className="newsletter-section" aria-labelledby="newsletter-draft-title">
              <header><h2 id="newsletter-draft-title">{t("m_0fe12d0e21")}</h2><p>{t("m_f20ac48471")}</p></header>
              <ResourceState resource={preview}>
                {preview.data && <NewsletterPreview key={preview.data.period.key + ':' + preview.data.editable} data={preview.data} reload={preview.reload} />}
              </ResourceState>
            </section>
            <div id="newsletter-delivery" hidden={section !== 'delivery'}>
            <section className="newsletter-section" aria-labelledby="newsletter-runs-title">
              <header><h2 id="newsletter-runs-title">{t("m_38d80c471e")}</h2><p>{t("m_56de601d6e")}</p></header>
              <div className="table-scroll"><table hidden={!r.data.runs?.length}>
                <caption className="sr-only">{t("m_bf14afdcdc")}</caption>
                <thead><tr><th scope="col">{t("m_37eaeef9ce")}</th><th scope="col">{t("m_8818829635")}</th><th scope="col">{t("m_033d3c9031")}</th></tr></thead>
                <tbody>
                  {r.data.runs?.map((run: any) => <tr key={run.week_start}>
                    <td>{formatDate(run.week_start)}</td>
                    <td>{run.last_checked_at ? new Date(run.last_checked_at).toLocaleString(locale, {timeZone:'Asia/Shanghai', hour12:false}) : '—'}</td>
                    <td>{run.reason}</td>
                  </tr>)}
                </tbody>
              </table></div>
              {!r.data.runs?.length && <div className="admin-empty-result"><AdminEmpty title={t("m_c3c7e61d55")} /></div>}
            </section>
            <section className="newsletter-section" aria-labelledby="delivery-title"><header><h2 id="delivery-title">{t("m_f0c5fa02c9")}</h2><p>{t("m_9e438423a2")}</p></header>
            <div className="table-scroll">
              <table hidden={!r.data.deliveries.items.length}><caption className="sr-only">{t("m_ce58d74325")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("m_73075237fd")}</th>
                    <th scope="col">{t("m_b869d2730b")}</th>
                    <th scope="col">{t("m_6320b4a872")}</th>
                    <th scope="col">{t("m_58a823852f")}</th>
                    <th scope="col">{t("m_e99a6717b6")}</th>
                  </tr>
                </thead>
                <tbody>
                  {r.data.deliveries.items.map((d: any) => (
                    <tr key={d.id}>
                      <td className="newsletter-email">{d.email}</td>
                      <td>{formatDate(d.week_start)}</td>
                      <td>
                        <span className="admin-status-chip">{t(labels[d.status])}</span>
                        {d.error && <small className="newsletter-delivery-error">{d.error}</small>}
                      </td>
                      <td>{d.attempts}</td>
                      <td>
                        {d.status === 'uncertain' && (
                          <div className="newsletter-row-actions">
                            <AdminButton type="button" variant="soft"
                              disabled={busy}
                              onClick={() =>
                                put(`/admin/newsletter/deliveries/${d.id}`, {
                                  status: 'sent',
                                })
                              }
                            >
                               {t("m_8df38dc381")} </AdminButton>
                            <AdminButton type="button" variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                put(`/admin/newsletter/deliveries/${d.id}`, {
                                  status: 'skipped',
                                })
                              }
                            >
                               {t("m_fc50a99caa")} </AdminButton>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!r.data.deliveries.items.length && <div className="admin-empty-result"><AdminEmpty title={t("m_7bf308b00b")} /></div>}
            {r.data.deliveries.total > 0 && <Pagination data={r.data.deliveries} onPage={setPage} />}</section>
            </div>
          </>
        )}
      </ResourceState>
      <section id="newsletter-subscribers" hidden={section !== 'subscribers' || !r.data} className="newsletter-section" aria-labelledby="subscriber-title"><header><h2 id="subscriber-title">{t("m_1d8f926772")}</h2><p>{t("m_2606b80a8e")}</p></header>
      <ResourceState resource={sub}>
        {sub.data && (
          <>
            <div className="admin-records newsletter-subscriber-records">
              {!sub.data.items.length&&<div className="admin-empty-result"><AdminEmpty title={t("m_bb18c45617")} /></div>}
              {sub.data.items.map((s: any) => (
                <article key={s.id}>
                  <div className="newsletter-subscriber-copy"><p>{s.email}</p><span className="admin-status-chip">{s.status === 'active' ? t("m_5ac3c37374") : s.status === 'pending' ? t("m_6a49d88efa") : t(labels[s.status])}</span></div>
                  <AdminButton type="button" variant="soft"
                    disabled={busy || s.status === 'unsubscribed'}
                    onClick={() =>
                      put(`/admin/subscribers/${s.id}`, {
                        status: 'unsubscribed',
                      })
                    }
                  >
                     {t("m_6af7023b9f")} </AdminButton>
                </article>
              ))}
            </div>
            {sub.data.total > 0 && <Pagination data={sub.data} onPage={setSubPage} />}
          </>
        )}
      </ResourceState>
      </section>
    </div>
  );
}
