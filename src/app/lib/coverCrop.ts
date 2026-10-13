import type {CSSProperties} from 'react';

export type CoverFrame = {x:number; y:number; zoom:number};
export type CoverCrop = {card:CoverFrame|null; detail:CoverFrame|null}|null;
export type CoverTarget = 'card'|'detail';
export type CoverSize = {width:number; height:number};

export const DEFAULT_CARD_FRAME:Readonly<CoverFrame> = Object.freeze({x:.5,y:.5,zoom:1});
export const DEFAULT_DETAIL_FRAME:Readonly<CoverFrame> = Object.freeze({x:.5,y:0,zoom:1});
const clamp = (value:number,min:number,max:number) => Math.min(max,Math.max(min,value));

export function normalizeCoverFrame(value:unknown):CoverFrame|null {
  if(!value || typeof value!=='object' || Array.isArray(value)) return null;
  const frame = value as Record<string,unknown>;
  if(![frame.x,frame.y,frame.zoom].every(item=>typeof item==='number' && Number.isFinite(item))) return null;
  return {x:clamp(frame.x as number,0,1),y:clamp(frame.y as number,0,1),zoom:clamp(frame.zoom as number,1,3)};
}

export function normalizeCoverCrop(value:unknown):CoverCrop {
  if(!value || typeof value!=='object' || Array.isArray(value)) return null;
  const crop = value as Record<string,unknown>;
  const card=normalizeCoverFrame(crop.card),detail=normalizeCoverFrame(crop.detail);
  return card || detail ? {card,detail} : null;
}

export function coverFrame(crop:unknown,target:CoverTarget):CoverFrame|null {
  return normalizeCoverCrop(crop)?.[target] ?? null;
}

export function effectiveCoverFrame(frame:unknown,target:CoverTarget):CoverFrame {
  return normalizeCoverFrame(frame) ?? {...(target==='detail'?DEFAULT_DETAIL_FRAME:DEFAULT_CARD_FRAME)};
}

export function describeCoverCrop(crop:unknown):string {
  const value=normalizeCoverCrop(crop);
  if(!value) return '默认取景';
  const describe=(frame:CoverFrame|null)=>frame
    ? `横向 ${Number((frame.x*100).toFixed(6))}% · 纵向 ${Number((frame.y*100).toFixed(6))}% · 缩放 ${Number((frame.zoom*100).toFixed(6))}%`
    : '默认取景';
  return `文章卡片：${describe(value.card)}；详情头图：${describe(value.detail)}`;
}

// x/y are fractions of the image's available overflow, rather than pixel offsets.
// Recompute the same fractions for every viewport so a frame never reveals blank space.
export function coverGeometry(image:CoverSize,viewport:CoverSize,frame:CoverFrame) {
  if(![image.width,image.height,viewport.width,viewport.height].every(value=>Number.isFinite(value) && value>0)) return null;
  const value=normalizeCoverFrame(frame) ?? {...DEFAULT_CARD_FRAME};
  const scale=Math.max(viewport.width/image.width,viewport.height/image.height)*value.zoom;
  const width=image.width*scale,height=image.height*scale;
  const overflowX=Math.max(0,width-viewport.width),overflowY=Math.max(0,height-viewport.height);
  return {width,height,overflowX,overflowY,left:-overflowX*value.x,top:-overflowY*value.y};
}

export function panCoverFrame(frame:CoverFrame,image:CoverSize,viewport:CoverSize,deltaX:number,deltaY:number):CoverFrame {
  const value=normalizeCoverFrame(frame) ?? {...DEFAULT_CARD_FRAME};
  const geometry=coverGeometry(image,viewport,value);
  if(!geometry || !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return value;
  return {
    x:geometry.overflowX>1e-7?clamp(value.x-deltaX/geometry.overflowX,0,1):value.x,
    y:geometry.overflowY>1e-7?clamp(value.y-deltaY/geometry.overflowY,0,1):value.y,
    zoom:value.zoom,
  };
}

// A covered image is already offset by -baseOverflow*x. Scaling around x% adds
// -(zoom-1)*viewportWidth*x, yielding exactly -zoomedOverflow*x (likewise for y).
// This pure CSS representation also works in the server-rendered document.
export function coverFrameStyle(frame:unknown):CSSProperties|undefined {
  const value=normalizeCoverFrame(frame);
  if(!value) return undefined;
  return {
    '--cover-x':`${value.x*100}%`,
    '--cover-y':`${value.y*100}%`,
    '--cover-zoom':value.zoom,
  } as CSSProperties;
}
