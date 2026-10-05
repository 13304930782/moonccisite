import type {Processor} from 'unified';
import {gfm} from 'micromark-extension-gfm';
import {gfmFromMarkdown} from 'mdast-util-gfm';
// Article rendering and headings only parse GFM; they never serialize Markdown.
// Register the same read extensions without bundling the unused writer plugins.
export default function remarkGfmRead(this: Processor) {
 const data=this.data();
 (data.micromarkExtensions ||= []).push(gfm());
 (data.fromMarkdownExtensions ||= []).push(gfmFromMarkdown());
}
