import {translate,type UiLocale} from '../i18n';
type Field=HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement;
/** Custom errors set by business logic take precedence over native validity. */
export function installNativeValidation(root:Document,getLocale:()=>UiLocale){
 const owned=new Map<Field,string>();
 const field=(target:EventTarget|null):Field|null=>target instanceof Element&&target.matches('input,select,textarea')&&'setCustomValidity' in target?target as Field:null;
 const clear=(element:Field)=>{const previous=owned.get(element);if(previous&&element.validationMessage===previous)element.setCustomValidity('');owned.delete(element);};
 const prune=()=>{for(const element of owned.keys())if(!element.isConnected)clear(element);};
 const invalid=(event:Event)=>{prune();const element=field(event.target);if(!element)return;clear(element);const validity=element.validity;if(validity.customError||validity.valid)return;
  const t=(key:string,params?:Record<string,string|number>)=>translate(getLocale(),key,params);
  let message:string;
  if(validity.valueMissing)message=t(element instanceof HTMLInputElement&&['checkbox','radio'].includes(element.type)?'请选择此选项。':'请填写此字段。');
  else if(validity.typeMismatch)message=t(element instanceof HTMLInputElement&&element.type==='email'?'请输入有效的邮箱地址。':'请输入有效的网址。');
  else if(validity.tooShort)message=t("m_4d95577359",{count:(element as HTMLInputElement).minLength});
  else if(validity.tooLong)message=t("m_05bc81f2f7",{count:(element as HTMLInputElement).maxLength});
  else if(validity.rangeUnderflow)message=t("m_29331183b5",{value:(element as HTMLInputElement).min});
  else if(validity.rangeOverflow)message=t("m_f0b77e73c6",{value:(element as HTMLInputElement).max});
  else if(validity.stepMismatch)message=t("m_1cfb8f9abb",{step:(element as HTMLInputElement).step||'1'});
  else if(validity.badInput)message=t("m_bf7380bc25");
  else message=t("m_6247c93c46");
  element.setCustomValidity(message);owned.set(element,message);
 };
 const input=(event:Event)=>{prune();const element=field(event.target);if(element)clear(element);};
 const reset=(event:Event)=>{prune();if(event.target instanceof Element&&event.target.tagName==='FORM')for(const element of (event.target as HTMLFormElement).elements){const input=field(element);if(input)clear(input);}};
 root.addEventListener('reset',reset,true);
 root.addEventListener('invalid',invalid,true);root.addEventListener('input',input,true);root.addEventListener('change',input,true);
 return()=>{root.removeEventListener('reset',reset,true);root.removeEventListener('invalid',invalid,true);root.removeEventListener('input',input,true);root.removeEventListener('change',input,true);for(const element of owned.keys())clear(element);};
}
