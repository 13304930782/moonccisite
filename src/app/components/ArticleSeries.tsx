import { articlePath } from '../lib/articleUrl';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import '../../styles/publishing.css';
export function ArticleSeries({id}:{id:number}) {
 const [data,setData]=useState<any>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let active=true;setData(null);setError('');setLoading(true);
  api('/series/article/'+id).then(result=>{if(active)setData(result);}).catch(e=>{
   if(active&&!(e instanceof ApiError&&e.status===404))setError('专栏导航加载失败');
  }).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[id,attempt]);
 if(loading)return <p className="muted" role="status">正在读取专栏导航…</p>;
 if(error)return <p role="status">{error}，<button className="quiet-button" onClick={()=>setAttempt(value=>value+1)}>重试</button></p>;
 if(!data)return null;
 return <nav className="publishing-card" aria-label="专栏文章导航"><p>收录于 <Link to={'/series/'+data.series.slug}>{data.series.title}</Link>{data.position>0&&data.total>0&&<span> · 第 {data.position} / {data.total} 篇</span>}</p><div className="publishing-actions">{data.previous&&<Link to={articlePath(data.previous)}>专栏上一篇：{data.previous.title}</Link>}{data.next&&<Link to={articlePath(data.next)}>专栏下一篇：{data.next.title}</Link>}</div></nav>;
}
