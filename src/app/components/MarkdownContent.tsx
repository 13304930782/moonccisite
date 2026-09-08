import { createElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { safeHref, safeImageSrc } from '../lib/safeUrl';

function plainText(node: any): string {
  return (
    node.value || node.alt || (node.children || []).map(plainText).join('')
  );
}
export function headingsFor(content: string) {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(String(content || ''));
  const headings: { id: string; title: string; level: number }[] = [];
  function visit(node: any) {
    if (node.type === 'heading' && node.depth <= 3)
      headings.push({
        id: `heading-${node.position.start.line - 1}`,
        title: plainText(node),
        level: node.depth,
      });
    for (const child of node.children || []) visit(child);
  }
  visit(tree);
  return headings;
}
export function MarkdownContent({
  content,
  headingPrefix,
}: {
  content: string;
  headingPrefix?: string;
}) {
  const heading =
    (level: number) =>
    ({ node, children }: any) =>
      createElement(
        `h${level}`,
        {
          id: headingPrefix
            ? `${headingPrefix}-${(node?.position?.start.line || 1) - 1}`
            : undefined,
        },
        children,
      );
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: heading(1),
          h2: heading(2),
          h3: heading(3),
          h4: heading(4),
          h5: heading(5),
          h6: heading(6),
          a: ({ href, children }) => {
            const safe = safeHref(href);
            return safe ? (
              <a
                href={safe}
                target={safe.startsWith('#') ? undefined : '_blank'}
                rel="noopener noreferrer"
              >
                {children}
              </a>
            ) : (
              <>{children}</>
            );
          },
          img: ({ src, alt }) => {
            const safe = safeImageSrc(src);
            return safe ? (
              <img src={safe} alt={alt || ''} loading="lazy" />
            ) : null;
          },
          table: ({ children }) => (
            <div
              className="markdown-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="文章表格"
            >
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {String(content || '')}
      </ReactMarkdown>
    </div>
  );
}
