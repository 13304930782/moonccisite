import { useI18n } from '../../i18n';
import type {ReactNode} from 'react';
import {Switch} from './Switch';
export type SocialLink={name:string;url:string;enabled:boolean};
export type FriendLink=SocialLink&{description:string;icon:string};
export function LinkCard({row,index,kind,handle,onChange,onRemove}:{row:SocialLink|FriendLink;index:number;kind:'social'|'links';handle:ReactNode;onChange:(key:string,value:unknown)=>void;onRemove:()=>void}){
  const { t } = useI18n();
 const title=kind==='social'?t("m_a19d092e8f"):t("m_c2a2f8293d");
 return <section className="bp-link-card" aria-label={`${title} ${index+1}`}>
  <header className="bp-link-heading"><span className="bp-index">{String(index+1).padStart(2,'0')}</span><span className="bp-link-avatar" aria-hidden="true">{Array.from(row.name.trim()||'?')[0]}</span><strong>{row.name||t("m_3fdc227200", {v0: title})}</strong><span className="bp-badge">{row.enabled?t("m_7a73baf0ce"):t("m_abcd7f6085")}</span><Switch label={t("m_ce2124fd70", {v0: title, v1: index+1})} checked={row.enabled} onChange={value=>onChange('enabled',value)}/>{handle}<button type="button" aria-label={t("m_248797e131", {v0: title, v1: index+1})} onClick={onRemove}>{t("m_2f9daa8289")}</button></header>
  <div className="bp-fields bp-link-fields">{(kind==='social'?['name','url']:['name','url','description','icon']).map(key=><label className="bp-field" key={key}>{({name:t("m_d44e9b3d3b"),url:t("m_a8ecb4b6da"),description:t("m_8131eafd02"),icon:t("m_15c51a3879")} as Record<string,string>)[key]}<input required={key==='name'||key==='url'} maxLength={key==='name'?100:key==='description'?500:2048} type={key==='url'&&kind==='links'?'url':'text'} value={String((row as unknown as Record<string,unknown>)[key]||'')} onChange={e=>onChange(key,e.target.value)} placeholder={key==='icon'?t("m_63e3352cc4"):undefined}/></label>)}</div>
 </section>;
}
