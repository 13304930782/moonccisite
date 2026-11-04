import { useI18n } from '../i18n';
import '../../styles/content-discovery.css';
import { ThemeSelect } from '../components/ThemeSelect';
import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeading, SitePage, useResource } from "../components/ContentUI";
import { PostResults } from "../components/PostResults";
export default function SearchPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const category = params.get('category') || '', tag = params.get('tag') || '';
  const categories = useResource('/posts/meta/categories'), tags = useResource('/posts/meta/tags');
  const query = new URLSearchParams();
  if(q) query.set('search',q);
  if(category) query.set('category',category);
  if(tag) query.set('tag',tag);
  function filter(key:string,value:string) { const next=new URLSearchParams(params); value?next.set(key,value):next.delete(key); next.delete('page'); setParams(next); }
  const [keyword, setKeyword] = useState(q);
  useEffect(() => setKeyword(q), [q]);
  function submit(e: FormEvent) {
    e.preventDefault();
    filter('q',keyword.trim());
  }
  return (
    <SitePage className="discovery-page">
      <PageHeading eyebrow="SEARCH" title={t("m_a8322456d1")}>
        <p>{t("m_a5a72387a7")}</p>
      </PageHeading>
      <form onSubmit={submit} className="inline-actions mb-8">
        <label className="sr-only" htmlFor="article-search">
           {t("m_c00a21fdf7")} </label>
        <input
          id="article-search"
          className="neo-input flex-1 min-w-0"
          type="search"
          maxLength={100}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t("m_26b5de5a5e")}
        />
        <button className="quiet-button">{t("m_44ce7ae909")}</button>
      </form>
      <div className="search-filters">
        <label>{t("m_515559957f")}<ThemeSelect aria-label={t("m_515559957f")} allowEmpty value={category} onValueChange={value=>filter('category',value)}><option value="">{t("m_a105443485")}</option>{(categories.data||[]).map((item:any)=><option key={item.category} value={item.category}>{item.category}</option>)}</ThemeSelect></label>
        <label>{t("m_1d0fd5f933")}<ThemeSelect aria-label={t("m_1d0fd5f933")} allowEmpty value={tag} onValueChange={value=>filter('tag',value)}><option value="">{t("m_b709cb12f0")}</option>{(tags.data||[]).map((item:any)=><option key={item.tag} value={item.tag}>{item.tag}</option>)}</ThemeSelect></label>
        {(categories.error || tags.error) && <p role="status">{t("m_774a622e91")}<button type="button" className="text-link" onClick={()=>{categories.reload();tags.reload();}}>{t("m_b8784c8dd5")}</button></p>}
      </div>
      {q || category || tag ? (
        <PostResults
          path={`/posts?${query}`}
          searchQuery={q}
          emptyAction={<button className="quiet-button" onClick={()=>{setKeyword('');setParams({});}}>{t("m_456c848474")}</button>}
          empty={t("m_b747bfa966")}
        />
      ) : (
        <p className="quiet-state">{t("m_baa76ac3e7")}</p>
      )}
    </SitePage>
  );
}
