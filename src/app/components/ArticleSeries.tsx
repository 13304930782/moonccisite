import {localizedPath,localeResource} from '../lib/locale';
import {useLocale} from '../context/LocaleContext';
import { useI18n } from '../i18n';
import { articlePath } from '../lib/articleUrl';
import { useEffect, useState } from 'react';

import {Link} from './LocaleLink';
import { api, ApiError } from '../lib/api';
import '../../styles/publishing.css';
export function ArticleSeries({id}:{id:number}) {
 const {contentLocale}=useLocale();
  const { t } = useI18n();
 const [data,setData]=useState<any>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let active=true;setData(null);setError('');setLoading(true);
  api(localeResource('/series/article/'+id,contentLocale)).then(result=>{if(active)setData(result);}).catch(e=>{
   if(active&&!(e instanceof ApiError&&e.status===404))setError(t("m_4121b1f8be"));
  }).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[id,attempt,contentLocale]);
 if(loading)return <p className="muted" role="status">{t("m_8d13d37be0")}</p>;
 if(error)return <p role="status">{t(error || '')}，<button className="quiet-button" onClick={()=>setAttempt(value=>value+1)}>{t("m_b8784c8dd5")}</button></p>;
 if(!data)return null;
 return <nav className="publishing-card" aria-label={t("m_429c55aa5b")}><p>{t("m_99f4d8d37d")} <Link to={localizedPath('/series/'+data.series.slug,data.series.content_locale||'zh-CN')}>{data.series.title}</Link>{data.position>0&&data.total>0&&<span>  {t("m_ca0b53cf6f")} {data.position} / {data.total}  {t("m_4e7b9204a9")}</span>}</p><div className="publishing-actions">{data.previous&&<Link to={articlePath(data.previous)}>{t("m_9be2758e34")}{data.previous.title}</Link>}{data.next&&<Link to={articlePath(data.next)}>{t("m_ff66f19c69")}{data.next.title}</Link>}</div></nav>;
}
