import {marked} from 'marked';
export const parseLegacy=(value:string)=>marked.parse(value,{async:false,gfm:true});
