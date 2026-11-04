import {localizedPath} from '../lib/locale';
import { useI18n } from '../i18n';
import { articlePath } from '../lib/articleUrl';
import {useParams} from 'react-router-dom';
import {Link} from '../components/LocaleLink';
import {SitePage,PageHeading,ResourceState,useResource} from '../components/ContentUI';
import {CardCoverImage} from '../components/CardCoverImage';
import '../../styles/publishing.css';
export default function SeriesPage(){
  const { t } = useI18n();
 const {slug}=useParams(),resource=useResource('/series'+(slug?'/'+encodeURIComponent(slug):''));
 const data=resource.data;
 return <SitePage><ResourceState resource={resource}>{data&&<section className="publishing-page">
 <PageHeading eyebrow="SERIES" title={slug?data.series.title:t("m_3fa933ffd6")}><Link className="text-link" to={slug?'/series':'/articles'}>{slug?t("m_904fc3fc09"):t("m_1ab08ebf53")} →</Link>
 {slug&&<p>{data.series.description}</p>}</PageHeading>
 {data.items?.length===0&&<p className="quiet-state">{slug?t("m_66ed62a537"):t("m_c993ce9141")}</p>}
 <div className="publishing-list">{data.items?.map((item:any,index:number)=><article className="publishing-card" key={item.id}>
 {item.cover_image&&<CardCoverImage src={item.cover_image} alt=""/>}
 <h2>{slug&&<span>{index+1}. </span>}<Link to={slug?articlePath(item):localizedPath('/series/'+item.slug,item.content_locale||'zh-CN')}>{item.title}</Link></h2>
 <p>{slug?item.summary:item.description}</p>{!slug&&<small>{item.article_count}  {t("m_9f115826f3")}</small>}
 </article>)}</div></section>}</ResourceState></SitePage>;
}
