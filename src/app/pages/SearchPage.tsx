import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeading, SitePage, useResource } from "../components/ContentUI";
import { PostResults } from "../components/PostResults";
export default function SearchPage() {
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
    <SitePage>
      <PageHeading eyebrow="SEARCH" title="搜索文章">
        <p>按标题、摘要、正文、分类和标签搜索。</p>
      </PageHeading>
      <form onSubmit={submit} className="inline-actions mb-8">
        <label className="sr-only" htmlFor="article-search">
          搜索关键词
        </label>
        <input
          id="article-search"
          className="neo-input flex-1 min-w-0"
          type="search"
          maxLength={100}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="输入关键词…"
        />
        <button className="quiet-button">搜索</button>
      </form>
      <div className="search-filters">
        <label>分类<select className="neo-input" value={category} onChange={e=>filter('category',e.target.value)}><option value="">全部分类</option>{(categories.data||[]).map((item:any)=><option key={item.category} value={item.category}>{item.category}</option>)}</select></label>
        <label>标签<select className="neo-input" value={tag} onChange={e=>filter('tag',e.target.value)}><option value="">全部标签</option>{(tags.data||[]).map((item:any)=><option key={item.tag} value={item.tag}>{item.tag}</option>)}</select></label>
        {(categories.error || tags.error) && <p role="status">筛选项暂时无法更新。<button type="button" className="text-link" onClick={()=>{categories.reload();tags.reload();}}>重试</button></p>}
      </div>
      {q || category || tag ? (
        <PostResults
          path={`/posts?${query}`}
          emptyAction={<button className="quiet-button" onClick={()=>{setKeyword('');setParams({});}}>清除搜索，重新查找</button>}
          empty="没有符合当前条件的文章。"
        />
      ) : (
        <p className="quiet-state">输入关键词，查找感兴趣的内容。</p>
      )}
    </SitePage>
  );
}
