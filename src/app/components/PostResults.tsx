import { BlogCard } from "./BlogCard";
import { ResourceState, useResource } from "./ContentUI";

export function PostResults({
  path,
  empty = "还没有发布文章。",
}: {
  path: string;
  empty?: string;
}) {
  const resource = useResource<any[]>(path);
  const posts = Array.isArray(resource.data) ? resource.data : [];
  return (
    <ResourceState resource={resource}>
      {!posts.length && <p className="quiet-state">{empty}</p>}
      <div className="post-grid">
        {posts.map((post) => {
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
              date={post.published_at || post.created_at}
              tags={tags}
              image={post.cover_image}
              category={post.category}
            />
          );
        })}
      </div>
    </ResourceState>
  );
}
