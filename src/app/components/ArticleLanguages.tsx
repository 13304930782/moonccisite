import { useI18n } from '../i18n';
import {useLocale} from '../context/LocaleContext';
import {articlePath} from '../lib/articleUrl';
import type {Locale} from '../lib/locale';

export function ArticleLanguages({post}:{post:any}){
  const { t } = useI18n();
 const {setLocale,uiLocale}=useLocale();
 const available:Locale[]=post.available_locales||['zh-CN'];
 return <nav className="inline-actions article-languages" aria-label={t("m_ea3597ab05")}>
  <span>{t("m_ea3597ab05")}</span>
  {available.map(language=><a className="text-link" key={language} href={articlePath(post,language)} hrefLang={language} lang={language==='en'?'en':uiLocale}
   aria-current={(post.content_locale||'zh-CN')===language?'page':undefined}
   onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();setLocale(language);}}>{language==='en'?'English':t("m_72726d8818")}</a>)}
  {!available.includes('en')&&<span role="status">{t("m_bde300932e")}</span>}
  {uiLocale==='en'&&(post.content_locale||'zh-CN')==='zh-CN'&&<span>{t("m_a073550aa7")}</span>}
 </nav>;
}
