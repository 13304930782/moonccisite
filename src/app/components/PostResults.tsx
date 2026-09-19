import {useSearchParams} from 'react-router-dom';
import {Pagination,PageData} from './ContentUI';
import { BlogCard } from "./BlogCard";
import { ResourceState, useResource } from "./ContentUI";

export function PostResults({
  path,
  empty = "还没有发布文章。",
}: {
  path: string;
  empty?: string;
}) {
  const [params,setParams]=useSearchParams();
  const page=Math.max(1,Number(params.get('page'))||1);
  const resource = useResource<PageData>(`${path}${path.includes('?')?'&':'?'}format=paged&pageSize=12&page=${page}`);
  const posts = resource.data?.items || [];
  function changePage(next:number){const p=new URLSearchParams(params);p.set('page',String(next));setParams(p);}

  return (
    <ResourceState resource={resource}>
      {!posts.length && <p className="quiet-state">{empty}</p>}
      <div className="post-grid">
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
              title={post.title}
              excerpt={post.summary}
              date={post.updated_at || post.published_at || post.created_at}
              dateLabel="更新于"
              tags={tags}
              image={post.cover_image}
              category={post.category}
            />
          );
        })}
      </div>
      {resource.data && resource.data.total>0 && <Pagination data={resource.data} onPage={changePage}/> }
    </ResourceState>
  );
}
