import { useEffect } from 'react';
import '../../styles/content-discovery.css';
import { searchExcerpt } from '../lib/searchExcerpt';
import {useSearchParams} from 'react-router-dom';
import {Pagination,PageData} from './ContentUI';
import { BlogCard } from "./BlogCard";
import { ResourceState, useResource } from "./ContentUI";

export function PostResults({
  path,
  empty = "还没有发布文章。",
  emptyAction,
  searchQuery,
}: {
  path: string;
  searchQuery?: string;
  empty?: string;
  emptyAction?: React.ReactNode;
}) {
  const [params,setParams]=useSearchParams();
  const requestedPage=Number(params.get('page'));
  const page=Number.isSafeInteger(requestedPage)&&requestedPage>=1?Math.min(requestedPage,100000):1;
  const resource = useResource<PageData>(`${path}${path.includes('?')?'&':'?'}format=paged&pageSize=12&page=${page}`);
  const posts = resource.data?.items || [];
  function changePage(next:number){const p=new URLSearchParams(params);next===1?p.delete('page'):p.set('page',String(next));setParams(p);}
  useEffect(()=>{
    if(resource.loading||resource.error||!resource.data)return;
    const lastPage=Math.max(1,Math.ceil(resource.data.total/resource.data.pageSize));
    const nextPage=Math.min(page,lastPage);
    if(params.has('page')&&(nextPage===1||params.get('page')!==String(nextPage))){
      const next=new URLSearchParams(params);nextPage===1?next.delete('page'):next.set('page',String(nextPage));
      setParams(next,{replace:true});
    }
  },[resource.loading,resource.error,resource.data,page,params,setParams]);

  return (
    <ResourceState resource={resource}>
      {resource.data && <p className="muted" role="status">共 {resource.data.total} 篇文章</p>}
      {!posts.length && <div className="quiet-state"><p>{empty}</p>{emptyAction}</div>}
      <div className="post-grid discovery-results">
        {posts.map((post:any) => {
          let tags: string[] = [];
          try {
            tags = Array.isArray(post.tags)
              ? post.tags
              : JSON.parse(post.tags || "[]");
          } catch {
            /* Legacy malformed tags are omitted. */
          }
          return (
            <BlogCard
              key={post.id}
              id={post.id}
              slug={post.slug}
              title={post.title}
              excerpt={searchQuery ? searchExcerpt(post, searchQuery) : post.summary}
              date={post.updated_at || post.published_at || post.created_at}
              dateLabel="更新于"
              tags={tags}
              image={post.cover_image}
              coverCrop={post.cover_crop}
              category={post.category}
            />
          );
        })}
      </div>
      {resource.data && resource.data.total>0 && <Pagination data={resource.data} onPage={changePage}/> }
    </ResourceState>
  );
}
