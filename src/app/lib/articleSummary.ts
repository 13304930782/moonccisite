// Comparison keys only; original summaries are rendered as React text, never HTML.
// Imported excerpts often repeat a truncated version of the opening paragraph.
function normalize(value:string) {
 return value.replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/<[^>]*>/g,' ').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
}
export function distinctArticleSummary(summary:string,content:string):string {
 const trimmed=summary.trim(),excerpt=normalize(trimmed),body=normalize(content);
 if(!excerpt)return '';
 const truncated=/(?:\.{3}|…+|⋯+)\s*$/.test(trimmed);
 const firstParagraph=normalize(content.trim().split(/\n\s*\n/)[0]);
 if(body.startsWith(excerpt)&&(truncated&&excerpt.length>=3||excerpt.length>=16||excerpt===firstParagraph))return '';
 return summary;
}
