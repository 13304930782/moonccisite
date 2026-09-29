import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {api} from '../lib/api';
import '../../styles/publishing.css';
export function ArticleSeries({id}:{id:number}){
 const [data,setData]=useState<any>(null);
 useEffect(()=>{let active=true;setData(null);api('/series/article/'+id).then(r=>{if(active)setData(r);}).catch(()=>{});return()=>{active=false;};},[id]);
 if(!data)return null;
 return <nav className="publishing-card" aria-label="专栏文章导航"><p>收录于 <Link to={'/series/'+data.series.slug}>{data.series.title}</Link></p><div className="publishing-actions">{data.previous&&<Link to={'/article/'+data.previous.id}>上一篇：{data.previous.title}</Link>}{data.next&&<Link to={'/article/'+data.next.id}>下一篇：{data.next.title}</Link>}</div></nav>;
}
