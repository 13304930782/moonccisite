import {createElement, type ReactNode} from 'react';
import {richTextFragment} from '../lib/richText';
import {dimensionsFor, type ImageDimensions} from '../lib/imageDimensions';
import {CodeBlock} from './CodeBlock';
import '../../styles/rich-text.css';
export function richTextHeadings(content: string) {
  return Array.from(richTextFragment(content).querySelectorAll('h1,h2,h3,h4,h5,h6')).flatMap((el,index) => Number(el.tagName[1]) <= 3 ? [{id:`heading-${index}`,title:el.textContent || '',level:Number(el.tagName[1])}] : []);
}
export function RichTextContent({content,headingPrefix,imageDimensions}: {content:string;headingPrefix?:string;imageDimensions?:ImageDimensions}) {
  let heading = 0;
  function render(node: Node, key: number): ReactNode {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1) return null;
    const el = node as HTMLElement, tag = el.tagName.toLowerCase();
    const props: Record<string,unknown> = {key};
    if (/^h[1-6]$/.test(tag)) { if(headingPrefix) props.id = `${headingPrefix}-${heading}`; heading++; }
    for (const attr of ['title','start','colspan','rowspan','data-type','data-checked']) if(el.hasAttribute(attr)) props[({colspan:'colSpan',rowspan:'rowSpan'} as Record<string,string>)[attr] || attr] = el.getAttribute(attr);
    if(el.style.textAlign || el.style.backgroundColor) props.style = {textAlign:el.style.textAlign,backgroundColor:el.style.backgroundColor};
    if(tag === 'img') return el.getAttribute('src') ? <img key={key} src={el.getAttribute('src')!} alt={el.getAttribute('alt') || ''} loading="lazy" {...dimensionsFor(el.getAttribute('src')!,imageDimensions)}/> : null;
    if(tag === 'input') return <input key={key} type="checkbox" checked={el.hasAttribute('checked')} disabled readOnly/>;
    if(tag === 'br' || tag === 'hr' || tag === 'col') return createElement(tag,props);
    if(tag === 'a') Object.assign(props,{href:el.getAttribute('href') || undefined,target:'_blank',rel:'noopener noreferrer'});
    if(tag === 'code') props.className = el.getAttribute('class') || undefined;
    const children = Array.from(el.childNodes).map(render);
    if(tag === 'pre') { const code=el.querySelector('code'); return <CodeBlock key={key}><code className={code?.className}>{code?.textContent || el.textContent}</code></CodeBlock>; }
    if(tag === 'table') return <div className="markdown-table-scroll" key={key} role="region" aria-label="文章表格" tabIndex={0}><table>{children}</table></div>;
    return createElement(tag,props,children);
  }
  return <div className="markdown-body rich-text-body">{Array.from(richTextFragment(content).childNodes).map(render)}</div>;
}
