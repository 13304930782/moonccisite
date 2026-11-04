import { useCallback, useRef } from 'react';
import { useLocale } from '../context/LocaleContext';
import englishUrl from './en.json?url';
import chineseUrl from './zh.json?url';
export type UiLocale = 'zh-CN' | 'en';
export type MessageParams = Record<string, string | number | null | undefined>;
export type Messages = Readonly<Record<string, string>>;
let english: Messages | undefined, sourceMessages: Messages | undefined;
let pending: Promise<void> | undefined, sourcePending: Promise<void> | undefined;
export function seedChineseMessages(messages: Messages) { sourceMessages=Object.freeze({...messages}); }
const missing = new Set<string>();
let chinese: Messages = {};
let templates: Partial<Record<UiLocale, ReturnType<typeof compileMessages>>> = {};
function compileMessages(messages: Messages) {
 return Object.entries(messages).filter(([key]) => /\{\w+\}/.test(key)&&/[a-z\p{Script=Han}]/iu.test(key.replace(/\{\w+\}/g,''))).map(([key,value]) => {
  const names: string[] = [];
  const pattern=key.replace(/\{(\w+)\}|[.*+?^${}()|[\]\\]/g,(part,name)=>{
   if(name){names.push(name);return '([\\s\\S]*?)';}return '\\'+part;
  });
  return {pattern:new RegExp('^'+pattern+'$'),value,names};
 });
}
// Catalogs are immutable and shared; locale always comes from this render's context.
export function seedEnglishMessages(messages: Messages) {
 english=Object.freeze({...messages});
 chinese=Object.freeze(Object.fromEntries(Object.entries(messages).map(([zh,en])=>[en,zh])));
 templates={en:compileMessages(english),'zh-CN':compileMessages(chinese)};
}
async function loadCatalog(url:string,seed:(messages:Messages)=>void){
 const response=await fetch(url);
 if(!response.ok)throw new Error('Language catalog unavailable');
 const messages=await response.json();
 if(!messages||typeof messages!=='object'||Array.isArray(messages)||Object.values(messages).some(value=>typeof value!=='string'))throw new Error('Language catalog unavailable');
 seed(messages);
}
export async function ensureMessages(locale:UiLocale){
 if(!sourceMessages)sourcePending ||= loadCatalog(chineseUrl,seedChineseMessages).catch(error=>{sourcePending=undefined;throw error;});
 if(locale==='en'&&!english)pending ||= loadCatalog(englishUrl,seedEnglishMessages).catch(error=>{pending=undefined;throw error;});
 await Promise.all([sourcePending,locale==='en'?pending:undefined]);
}
export function translate(locale:UiLocale,key:string,params?:MessageParams):string{
 key=sourceMessages?.[key]||key;
 if(/^m_[a-f0-9]{10}$/.test(key))return locale==='en'?'Loading interface…':'正在加载界面…';
 const catalog=locale==='en'?english:chinese;
 let message=locale==='zh-CN'&&english?.[key]?key:catalog?.[key]||catalog?.[key.trim()]||'';
 if(!message)for(const template of templates[locale]||[]){
  const match=template.pattern.exec(key);
  if(match){message=template.value.replace(/\{(\w+)\}/g,(whole,name)=>{const index=template.names.indexOf(name);return index<0?whole:match[index+1];});break;}
 }
 if(!message){
  message=key;
  if(locale==='en'&&/\p{Script=Han}/u.test(key)){
   if(import.meta.env.DEV&&!missing.has(key)){missing.add(key);console.warn('[i18n] Missing English message:',key);}
   message='Translation unavailable';
  }
 }
 return params?message.replace(/\{(\w+)\}/g,(match,name)=>Object.hasOwn(params,name)?String(params[name]??''):match):message;
}
export function useI18n(){
 const {uiLocale}=useLocale();
 const current=useRef(uiLocale);current.current=uiLocale;
 const t=useCallback((key:string,params?:MessageParams)=>translate(current.current,key,params),[]);
 const formatDate=useCallback((value:Date|string|number|null|undefined,options?:Intl.DateTimeFormatOptions)=>{if(!value)return '';const date=new Date(value);return Number.isNaN(date.getTime())?String(value):new Intl.DateTimeFormat(uiLocale,{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',...options}).format(date);},[uiLocale]);
 return {locale:uiLocale,t,formatDate};
}
