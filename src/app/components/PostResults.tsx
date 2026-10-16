import {useSearchParams} from 'react-router-dom';
import {Pagination,PageData} from './ContentUI';
import { BlogCard } from "./BlogCard";
import { ResourceState, useResource } from "./ContentUI";
import { useEffect, useLayoutEffect, useRef } from 'react';
import { feedbackMotion } from '../lib/feedbackMotion';
import { motionDesign } from '../lib/motionDesign';

export function PostResults({
  path,
  empty = "还没有发布文章。",
  emptyAction,
}: {
  path: string;
  empty?: string;
  emptyAction?: React.ReactNode;
}) {
  const [params,setParams]=useSearchParams();
  const page=Math.max(1,Number(params.get('page'))||1);
  const resource = useResource<PageData>(`${path}${path.includes('?')?'&':'?'}format=paged&pageSize=12&page=${page}`, true, { keepPrevious: true });
  const posts = resource.data?.items || [];
  const grid = useRef<HTMLDivElement>(null), previous = useRef<Map<string,string> | null>(null);
  const layoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
  layoutEffect(() => {
    if (resource.loading || !resource.data || !grid.current) return;
    const rows = Array.from(grid.current.querySelectorAll<HTMLElement>('.blog-card'));
    const next = new Map(rows.map(row => [row.getAttribute('href') || '', row.textContent || '']));
    const old = previous.current; previous.current = next;
    if (!old) return;
    const stops = rows.filter(row => old.get(row.getAttribute('href') || '') !== row.textContent).map(row =>
      feedbackMotion(row, { opacity: [.75, 1], transform: ['translateY(6px)', 'none'] }, motionDesign.content.duration));
    return () => stops.forEach(stop => stop());
  }, [resource.data, resource.loading]);
  function changePage(next:number){const p=new URLSearchParams(params);p.set('page',String(next));setParams(p);}

  return (
    <ResourceState resource={resource}>
      {resource.data && <p className="muted" role="status">共 {resource.data.total} 篇文章</p>}
      {!posts.length && <div className="quiet-state"><p>{empty}</p>{emptyAction}</div>}
      <div className="post-grid" ref={grid}>
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
              coverCrop={post.cover_crop}
              category={post.category}
            />
          );
        })}
      </div>
      {resource.data && resource.data.total>0 && <Pagination data={resource.loading || resource.error ? { ...resource.data, page } : resource.data} onPage={changePage}/> }
    </ResourceState>
  );
}
