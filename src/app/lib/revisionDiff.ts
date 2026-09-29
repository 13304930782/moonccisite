export type DiffLine={kind:'same'|'added'|'removed';text:string};
// Bounded look-ahead aligns inserted/deleted lines without an O(n*m) matrix.
export function revisionDiff(before:string,after:string):DiffLine[]{
 const a=before.split('\n'),b=after.split('\n'),out:DiffLine[]=[];let i=0,j=0;
 while(i<a.length||j<b.length){
  if(i<a.length&&j<b.length&&a[i]===b[j]){out.push({kind:'same',text:a[i++]});j++;continue;}
  let ai=-1,bj=-1;
  if(i<a.length&&j<b.length){for(let n=1;n<=64;n++){if(ai<0&&a[i+n]===b[j])ai=i+n;if(bj<0&&b[j+n]===a[i])bj=j+n;if(ai>=0||bj>=0)break;}}
  if(bj>=0&&(ai<0||bj-j<=ai-i)){while(j<bj)out.push({kind:'added',text:b[j++]});}
  else if(ai>=0){while(i<ai)out.push({kind:'removed',text:a[i++]});}
  else{if(i<a.length)out.push({kind:'removed',text:a[i++]});if(j<b.length)out.push({kind:'added',text:b[j++]});}
 }
 return out;
}
