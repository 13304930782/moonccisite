import { useI18n } from '../i18n';
import { articlePath } from '../lib/articleUrl';
import {useSearchParams} from 'react-router-dom';
import {Link} from '../components/LocaleLink';
import {SitePage,PageHeading,ResourceState,Pagination,PageData,useResource,formatDate} from '../components/ContentUI';
import {EmptyState} from '../components/DetailUI';
import '../../styles/blog-foundation.css';
export default function ArchivesPage(){
  const { t , formatDate} = useI18n();
 const [params,setParams]=useSearchParams();const page=Math.max(1,Number(params.get('page'))||1);
 const resource=useResource<PageData & {months:{month:string;count:number}[]}>(`/posts/archives?page=${page}`);
 const groups=new Map<string,any[]>();for(const post of resource.data?.items||[]){const key=post.month||t("m_a3f1cde9f1");groups.set(key,[...(groups.get(key)||[]),post]);}
 return <SitePage><PageHeading eyebrow="ARCHIVES" title={t("m_aa226b33b3")}><p>{t("m_0c54730960")}</p></PageHeading><ResourceState resource={resource}>
 {!groups.size&&<EmptyState>{t("m_ced1ff3aaf")}</EmptyState>}
 <div className="archive-list">{[...groups].map(([month,posts])=><section key={month}><h2>{month.replace('-',t("m_62ef900a8f"))}  {t("m_1625179bad")} <small>{t("m_76e547a8fa")} {resource.data?.months.find((m:{month:string;count:number})=>m.month===month)?.count||posts.length}  {t("m_4e7b9204a9")}</small></h2>{posts.map(post=><Link className="archive-row" key={post.id} to={articlePath(post)}><time>{formatDate(post.published_at)}</time><span>{post.title}</span></Link>)}</section>)}</div>
 {resource.data&&resource.data.total>0&&<Pagination data={resource.data} onPage={p=>setParams({page:String(p)})}/>}</ResourceState></SitePage>;
}
