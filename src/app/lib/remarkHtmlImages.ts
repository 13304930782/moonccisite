import { richTextFragment } from './richText';

/** Convert only parsed HTML image nodes; Markdown code examples never enter this path. */
export default function remarkHtmlImages() {
  return (tree: any) => {
    function visit(parent: any) {
      if (!parent.children) return;
      parent.children = parent.children.flatMap((node: any) => {
        if (node.type !== 'html') { visit(node); return [node]; }
        const fragment = richTextFragment(node.value);
        if (!fragment.querySelector('img[src]')) return [node];
        function convert(child: Node): any[] {
          if (child.nodeType === 3) return [{ type: 'text', value: child.textContent || '' }];
          if (child.nodeType !== 1) return [];
          const element = child as Element;
          if (element.tagName === 'IMG') {
            const url = element.getAttribute('src');
            return url ? [{ type: 'image', url, alt: element.getAttribute('alt') || '', title: element.getAttribute('title') || null }] : [];
          }
          return Array.from(child.childNodes).flatMap(convert);
        }
        return Array.from(fragment.childNodes).flatMap(convert);
      });
    }
    visit(tree);
  };
}
