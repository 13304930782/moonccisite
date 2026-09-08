import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeading, SitePage } from "../components/ContentUI";
import { PostResults } from "../components/PostResults";
export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const [keyword, setKeyword] = useState(q);
  useEffect(() => setKeyword(q), [q]);
  function submit(e: FormEvent) {
    e.preventDefault();
    setParams(keyword.trim() ? { q: keyword.trim() } : {});
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
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="输入关键词…"
        />
        <button className="quiet-button">搜索</button>
      </form>
      {q ? (
        <PostResults
          path={`/posts?search=${encodeURIComponent(q)}`}
          empty={`没有找到与「${q}」相关的文章。`}
        />
      ) : (
        <p className="quiet-state">输入关键词，查找感兴趣的内容。</p>
      )}
    </SitePage>
  );
}
