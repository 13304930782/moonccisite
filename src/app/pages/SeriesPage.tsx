import {Link,useParams} from 'react-router-dom';
import {SitePage,ResourceState,useResource} from '../components/ContentUI';
import {safeImageSrc} from '../lib/safeUrl';
import '../../styles/publishing.css';
export default function SeriesPage(){
 const {slug}=useParams(),resource=useResource('/series'+(slug?'/'+encodeURIComponent(slug):''));
 const data=resource.data;
 return <SitePage><ResourceState resource={resource}>{data&&<section className="publishing-page">
 <Link to={slug?'/series':'/articles'}>{slug?'全部专栏':'全部文章'}</Link>
 <h1>{slug?data.series.title:'文章专栏'}</h1>
 {slug&&<p>{data.series.description}</p>}
 {data.items?.length===0&&<p>暂时没有公开专栏。</p>}
 <div className="publishing-list">{data.items?.map((item:any)=><article className="publishing-card" key={item.id}>
 {item.cover_image&&<img src={safeImageSrc(item.cover_image)} alt="" style={{width:'100%',maxHeight:220,objectFit:'cover'}}/>}
 <h2><Link to={slug?'/article/'+item.id:'/series/'+item.slug}>{item.title}</Link></h2>
 <p>{slug?item.summary:item.description}</p>{!slug&&<small>{item.article_count} 篇文章</small>}
 </article>)}</div></section>}</ResourceState></SitePage>;
}
