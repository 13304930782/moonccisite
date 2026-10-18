import {createContext, useContext, createElement, type ReactNode} from 'react';
import {richTextFragment} from '../lib/richText';
import {dimensionsFor, type ImageDimensions} from '../lib/imageDimensions';
import {CodeBlock} from './CodeBlock';
import {youtubeEmbedUrl} from '../lib/youtube';
import {YouTubeLink} from './YouTubeLink';
import {youtubeVideoId} from '../lib/youtube';
import '../../styles/rich-text.css';
export const EmbeddedPlayback = createContext(true);
export function richTextHeadings(content: string) {
  return Array.from(richTextFragment(content).querySelectorAll('h1,h2,h3,h4,h5,h6')).flatMap((el,index) => Number(el.tagName[1]) <= 3 && el.textContent?.trim() ? [{id:`heading-${index}`,title:el.textContent.trim(),level:Number(el.tagName[1])}] : []);
}
export function RichTextContent({content,headingPrefix,imageDimensions}: {content:string;headingPrefix?:string;imageDimensions?:ImageDimensions}) {
  const playback = useContext(EmbeddedPlayback);
  let heading = 0;
  function render(node: Node, key: number): ReactNode {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1) return null;
    const el = node as HTMLElement, tag = el.tagName.toLowerCase();
    const props: Record<string,unknown> = {key};
    const videoId = el.getAttribute('data-youtube-id');
    if (tag === 'div' && videoId) return <figure className="rich-youtube" key={key}>
      {playback ? <iframe src={youtubeEmbedUrl(videoId, Number(el.getAttribute('data-youtube-start')) || 0)} title="YouTube 视频" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/> : <div className="youtube-device-placeholder">YouTube 视频 · 请在阅读预览中播放</div>}
      <figcaption><a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer">在 YouTube 观看 ↗</a></figcaption>
    </figure>;
    if (/^h[1-6]$/.test(tag)) { if(headingPrefix) props.id = `${headingPrefix}-${heading}`; heading++; }
    for (const attr of ['title','start','colspan','rowspan','data-type','data-checked']) if(el.hasAttribute(attr)) props[({colspan:'colSpan',rowspan:'rowSpan'} as Record<string,string>)[attr] || attr] = el.getAttribute(attr);
    if(el.style.textAlign || el.style.backgroundColor) props.style = {textAlign:el.style.textAlign,backgroundColor:el.style.backgroundColor};
    if(tag === 'img') {
      const src = el.getAttribute('src');
      const width = Number(el.getAttribute('width')) || undefined;
      const dimensions = dimensionsFor(src || undefined, imageDimensions);
      const caption = el.getAttribute('data-image-caption');
      const image = src ? <img key={key} src={src} alt={el.getAttribute('alt') || ''} loading="lazy"
        {...(width ? { width, height: dimensions.width && dimensions.height ? Math.round(width * dimensions.height / dimensions.width) : undefined } : dimensions)}
        data-image-align={el.getAttribute('data-image-align') || undefined}
        data-image-layout={el.getAttribute('data-image-layout') || undefined}/> : null;
      return image && caption ? <figure key={key} className="rich-image-figure" style={{width:width || dimensions.width || 'fit-content'}}
        data-image-align={el.getAttribute('data-image-align') || undefined} data-image-layout={el.getAttribute('data-image-layout') || undefined}>
        {image}<figcaption>{caption}</figcaption>
      </figure> : image;
    }
    if(tag === 'input') return <input key={key} type="checkbox" checked={el.hasAttribute('checked')} disabled readOnly/>;
    if(tag === 'br' || tag === 'hr' || tag === 'col') return createElement(tag,props);
    if(tag === 'a') Object.assign(props,{href:el.getAttribute('href') || undefined,target:'_blank',rel:'noopener noreferrer'});
    if(tag === 'code') props.className = el.getAttribute('class') || undefined;
    const children = renderNodes(Array.from(el.childNodes));
    if (tag === 'a' && youtubeVideoId(el.getAttribute('href') || '')) return <YouTubeLink key={key} href={el.getAttribute('href')!}>{children}</YouTubeLink>;
    if(tag === 'pre') { const code=el.querySelector('code'); return <CodeBlock key={key}><code className={code?.className}>{code?.textContent || el.textContent}</code></CodeBlock>; }
    if(tag === 'table') return <div className="markdown-table-scroll" key={key} role="region" aria-label="文章表格" tabIndex={0}><table>{children}</table></div>;
    return createElement(tag,props,children);
  }
  function renderNodes(nodes: Node[]): ReactNode[] {
    const output: ReactNode[] = [];
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      let next = index + 1;
      while (next < nodes.length && nodes[next].nodeType === 3 && !nodes[next].textContent?.trim()) next++;
      if (node.nodeType === 1 && (node as HTMLElement).matches('img[src][data-image-layout="heading"]') &&
          nodes[next]?.nodeType === 1 && /^H[1-6]$/.test((nodes[next] as HTMLElement).tagName)) {
        output.push(<div key={index} className="rich-image-heading">{render(node,index)}{render(nodes[next],next)}</div>);
        index = next;
      } else output.push(render(node,index));
    }
    return output;
  }
  return <div className="markdown-body rich-text-body">{renderNodes(Array.from(richTextFragment(content).childNodes))}</div>;
}
