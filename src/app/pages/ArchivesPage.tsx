import {Link,useSearchParams} from 'react-router-dom';
import {SitePage,PageHeading,ResourceState,Pagination,PageData,useResource,formatDate} from '../components/ContentUI';
import {EmptyState} from '../components/DetailUI';
import '../../styles/blog-foundation.css';
export default function ArchivesPage(){
 const [params,setParams]=useSearchParams();const page=Math.max(1,Number(params.get('page'))||1);
 const resource=useResource<PageData & {months:{month:string;count:number}[]}>(`/posts/archives?page=${page}`);
 const groups=new Map<string,any[]>();for(const post of resource.data?.items||[]){const key=post.month||'未知日期';groups.set(key,[...(groups.get(key)||[]),post]);}
 return <SitePage><PageHeading eyebrow="ARCHIVES" title="文章归档"><p>按最初发布的时间，回看写过的文章。</p></PageHeading><ResourceState resource={resource}>
 {!groups.size&&<EmptyState>还没有发布文章。</EmptyState>}
 <div className="archive-list">{[...groups].map(([month,posts])=><section key={month}><h2>{month.replace('-',' 年 ')} 月 <small>共 {resource.data?.months.find((m:{month:string;count:number})=>m.month===month)?.count||posts.length} 篇</small></h2>{posts.map(post=><Link className="archive-row" key={post.id} to={`/article/${post.id}`}><time>{formatDate(post.published_at)}</time><span>{post.title}</span></Link>)}</section>)}</div>
 {resource.data&&resource.data.total>0&&<Pagination data={resource.data} onPage={p=>setParams({page:String(p)})}/>}</ResourceState></SitePage>;
}
