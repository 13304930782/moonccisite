/** Remove only the old site's generated notice at the start; leave other prose untouched. */
export function stripLegacyAgeNotice(value: unknown): string {
 const text=String(value||'');
 return text.replace(/^\s*(?:>\s*)?(?:\*\*)?提醒[：:]\s*本文最后更新于\s*[\d\s/:年月日-]+[，,]\s*文中所关联的信息可能已发生改变[，,]\s*请知悉[！!。.]?(?:\*\*)?\s*/u,'');
}
function dayParts(date: Date): number[] {
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(date);
 return ['year','month','day'].map(key=>Number(parts.find(p=>p.type===key)?.value));
}
export function isArticleOld(published: unknown, now=new Date()): boolean {
 if(!published||!Number.isFinite(now.getTime()))return false;
 const value=String(published);let parts:number[];
 if(/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(value))parts=value.slice(0,10).split('-').map(Number);
 else {const date=new Date(value);if(!Number.isFinite(date.getTime()))return false;parts=dayParts(date);}
 const [year,month,day]=parts;
 if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate())return false;
 const target=new Date(Date.UTC(year,month-1+6,1));const y=target.getUTCFullYear(),m=target.getUTCMonth()+1;
 const d=Math.min(day,new Date(Date.UTC(y,m,0)).getUTCDate());const [ny,nm,nd]=dayParts(now);
 return ny*10000+nm*100+nd>=y*10000+m*100+d;
}
