import type {ReactNode} from 'react';
import {Switch} from './Switch';
export type SocialLink={name:string;url:string;enabled:boolean};
export type FriendLink=SocialLink&{description:string;icon:string};
export function LinkCard({row,index,kind,handle,onChange,onRemove}:{row:SocialLink|FriendLink;index:number;kind:'social'|'links';handle:ReactNode;onChange:(key:string,value:unknown)=>void;onRemove:()=>void}){
 const title=kind==='social'?'社交链接':'友情链接';
 return <section className="bp-link-card" aria-label={`${title} ${index+1}`}>
  <header className="bp-link-heading"><span className="bp-index">{String(index+1).padStart(2,'0')}</span><span className="bp-link-avatar" aria-hidden="true">{Array.from(row.name.trim()||'?')[0]}</span><strong>{row.name||`新${title}`}</strong><span className="bp-badge">{row.enabled?'公开':'未公开'}</span><Switch label={`公开显示${title} ${index+1}`} checked={row.enabled} onChange={value=>onChange('enabled',value)}/>{handle}<button type="button" aria-label={`删除${title} ${index+1}`} onClick={onRemove}>删除</button></header>
  <div className="bp-fields bp-link-fields">{(kind==='social'?['name','url']:['name','url','description','icon']).map(key=><label className="bp-field" key={key}>{({name:'名称',url:'网址',description:'简介',icon:'图标地址'} as Record<string,string>)[key]}<input required={key==='name'||key==='url'} maxLength={key==='name'?100:key==='description'?500:2048} type={key==='url'&&kind==='links'?'url':'text'} value={String((row as unknown as Record<string,unknown>)[key]||'')} onChange={e=>onChange(key,e.target.value)} placeholder={key==='icon'?'留空时使用网站图标':undefined}/></label>)}</div>
 </section>;
}
