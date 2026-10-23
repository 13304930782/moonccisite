import { articlePath } from '../lib/articleUrl';
import {Link,useParams} from 'react-router-dom';
import {SitePage,PageHeading,ResourceState,useResource} from '../components/ContentUI';
import {CardCoverImage} from '../components/CardCoverImage';
import '../../styles/publishing.css';
export default function SeriesPage(){
 const {slug}=useParams(),resource=useResource('/series'+(slug?'/'+encodeURIComponent(slug):''));
 const data=resource.data;
 return <SitePage><ResourceState resource={resource}>{data&&<section className="publishing-page">
 <PageHeading eyebrow="SERIES" title={slug?data.series.title:'文章专栏'}><Link className="text-link" to={slug?'/series':'/articles'}>{slug?'全部专栏':'全部文章'} →</Link>
 {slug&&<p>{data.series.description}</p>}</PageHeading>
 {data.items?.length===0&&<p>暂时没有公开专栏。</p>}
 <div className="publishing-list">{data.items?.map((item:any,index:number)=><article className="publishing-card" key={item.id}>
 {item.cover_image&&<CardCoverImage src={item.cover_image} alt=""/>}
 <h2>{slug&&<span>{index+1}. </span>}<Link to={slug?articlePath(item):'/series/'+item.slug}>{item.title}</Link></h2>
 <p>{slug?item.summary:item.description}</p>{!slug&&<small>{item.article_count} 篇文章</small>}
 </article>)}</div></section>}</ResourceState></SitePage>;
}
