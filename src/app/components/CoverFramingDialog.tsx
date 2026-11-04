import { useI18n } from '../i18n';
import {useEffect,useId,useLayoutEffect,useRef,useState,type CSSProperties,type KeyboardEvent,type PointerEvent} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {CoverImage} from './CoverImage';
import {CardCoverImage} from './CardCoverImage';
import {effectiveCoverFrame,normalizeCoverCrop,type CoverCrop,type CoverFrame,type CoverSize} from '../lib/coverCrop';
import {safeImageSrc} from '../lib/safeUrl';
import '../../styles/cover-framing.css';

type LoadState = {kind:'loading'}|{kind:'ready';size:CoverSize}|{kind:'error';message:string};
type Drag = {pointerId:number;clientX:number;clientY:number;frame:CoverFrame;width:number;height:number};
const DEFAULT_FOCUS:CoverFrame={x:.5,y:.3,zoom:1};
const clamp=(value:number)=>Math.min(1,Math.max(0,value));
function initialDetail(value:CoverCrop) {
  const crop=normalizeCoverCrop(value);
  return crop?effectiveCoverFrame(crop.detail,'detail'):{...DEFAULT_FOCUS};
}

export function CoverFramingDialog({src,value,onConfirm,onClose}:{src:string;value:CoverCrop;onConfirm:(value:CoverCrop)=>void;onClose:()=>void}) {
  const { t } = useI18n();
  const safeSrc=safeImageSrc(src),hintId=useId(),zoomId=useId();
  const original=useRef(value);
  const [detailFrame,setDetailFrame]=useState(()=>initialDetail(value)),[changed,setChanged]=useState(false);
  const [load,setLoad]=useState<LoadState>({kind:'loading'}),[attempt,setAttempt]=useState(0);
  const [viewport,setViewport]=useState<CoverSize>({width:0,height:0});
  const [stageElement,setStageElement]=useState<HTMLDivElement|null>(null);
  const heading=useRef<HTMLHeadingElement>(null),previousFocus=useRef<HTMLElement|null>(null),drag=useRef<Drag|null>(null);
  const detailMarker=useRef<HTMLButtonElement>(null);
  const ready=load.kind==='ready';
  const sourceBox=ready && viewport.width>0 && viewport.height>0?(()=>{
    // Reserve the 44px target around edge coordinates so a focus at 0/100%
    // remains entirely clickable without clipping or covering other controls.
    const scale=Math.min(Math.max(1,viewport.width-44)/load.size.width,Math.max(1,viewport.height-44)/load.size.height);
    const width=load.size.width*scale,height=load.size.height*scale;
    return {width,height,left:(viewport.width-width)/2,top:(viewport.height-height)/2};
  })():null;

  useEffect(()=>{
    original.current=value;setDetailFrame(initialDetail(value));setChanged(false);drag.current=null;
  },[src]);
  useEffect(()=>{
    let active=true;setLoad({kind:'loading'});
    if(!safeSrc){setLoad({kind:'error',message:t("m_9ac42fd5c6")});return;}
    const image=new Image();image.decoding='async';
    const finish=(state:LoadState)=>{if(active){clearTimeout(timer);setLoad(state);}};
    const timer=setTimeout(()=>finish({kind:'error',message:t("m_90e24bae70")}),20000);
    image.onload=()=>finish(image.naturalWidth>0 && image.naturalHeight>0
      ?{kind:'ready',size:{width:image.naturalWidth,height:image.naturalHeight}}
      :{kind:'error',message:t("m_35e1a9d3a5")});
    image.onerror=()=>finish({kind:'error',message:t("m_fabdd8d8c3")});
    image.src=safeSrc;
    return()=>{active=false;clearTimeout(timer);image.onload=null;image.onerror=null;};
  },[safeSrc,attempt]);
  useLayoutEffect(()=>{
    const element=stageElement;if(!element)return;
    const measure=()=>{const bounds=element.getBoundingClientRect();setViewport({width:bounds.width,height:bounds.height});drag.current=null;};
    measure();const observer=new ResizeObserver(measure);observer.observe(element);
    return()=>observer.disconnect();
  },[stageElement]);

  function changeFrame(next:CoverFrame) {
    setChanged(true);setDetailFrame(next);
  }
  function endDrag(event:PointerEvent<HTMLButtonElement>) {
    if(drag.current?.pointerId!==event.pointerId)return;
    drag.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function beginDrag(event:PointerEvent<HTMLButtonElement>) {
    if(!ready || !sourceBox || event.button!==0 || !event.isPrimary)return;
    event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);
    drag.current={pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,frame:detailFrame,width:sourceBox.width,height:sourceBox.height};
  }
  function moveDrag(event:PointerEvent<HTMLButtonElement>) {
    const current=drag.current;if(!current || current.pointerId!==event.pointerId)return;
    changeFrame({...current.frame,x:clamp(current.frame.x+(event.clientX-current.clientX)/current.width),y:clamp(current.frame.y+(event.clientY-current.clientY)/current.height)});
  }
  function moveKey(event:KeyboardEvent<HTMLButtonElement>) {
    if(!ready || event.altKey || event.ctrlKey || event.metaKey)return;
    const distance=event.shiftKey?.05:.01;
    const directions:Record<string,[number,number]>={ArrowLeft:[-distance,0],ArrowRight:[distance,0],ArrowUp:[0,-distance],ArrowDown:[0,distance]};
    const delta=directions[event.key];if(!delta)return;
    event.preventDefault();changeFrame({...detailFrame,x:clamp(detailFrame.x+delta[0]),y:clamp(detailFrame.y+delta[1])});
  }
  function resetFrames() {
    drag.current=null;changeFrame({...DEFAULT_FOCUS});
  }
  function marker() {
    return <button type="button" ref={detailMarker} className="cover-framing-focus" data-target="detail"
      style={{left:`${detailFrame.x*100}%`,top:`${detailFrame.y*100}%`}} role="slider" aria-label={t("m_c4ad90155a")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(detailFrame.x*100)}
      aria-valuetext={t("m_42e2cefeba", {v0: Math.round(detailFrame.x*100), v1: Math.round(detailFrame.y*100)})} aria-describedby={hintId}
      onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={event=>{if(drag.current?.pointerId===event.pointerId)drag.current=null;}} onKeyDown={moveKey}/>;
  }
  function controls() {
    const frame=detailFrame,id=zoomId;
    return <div className="cover-framing-focus-controls">
      <div className="cover-framing-focus-value"><span>{t("m_b4929391ad")}</span><button type="button" className="cover-framing-coordinate" disabled={!ready} onClick={()=>detailMarker.current?.focus()} aria-label={t("m_06a2fa1085")}>{Math.round(frame.x*100)}% · {Math.round(frame.y*100)}%</button></div>
      <label htmlFor={id}>{t("m_b762aec769")} <output htmlFor={id}>{frame.zoom.toFixed(1)}×</output></label>
      <input id={id} type="range" min="1" max="3" step=".1" value={frame.zoom} aria-label={t("m_f976fc7575")} aria-valuetext={t("m_82ec8eba6d", {v0: frame.zoom.toFixed(1)})} disabled={!ready} onChange={event=>changeFrame({...frame,zoom:Number(event.target.value)})}/>
    </div>;
  }

  return <Dialog.Root open onOpenChange={open=>{if(!open)onClose();}}><Dialog.Portal>
    <Dialog.Overlay className="cover-framing-overlay"/>
    <Dialog.Content className="cover-framing-dialog" onOpenAutoFocus={event=>{
      previousFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
      event.preventDefault();heading.current?.focus();
    }} onCloseAutoFocus={event=>{
      if(previousFocus.current?.isConnected){event.preventDefault();previousFocus.current.focus();}
    }}>
      <header className="cover-framing-header"><Dialog.Close className="cover-framing-button">{t("m_2cd0f3be87")}</Dialog.Close><Dialog.Title ref={heading} tabIndex={-1}>{t("m_b52cec9033")}</Dialog.Title><button type="button" className="cover-framing-button cover-framing-confirm" disabled={!ready} onClick={()=>onConfirm({card:original.current?.card??null,detail:!original.current||changed?detailFrame:original.current.detail})}>{t("m_fac2a67ad8")}</button></header>
      <Dialog.Description className="cover-framing-description"><span id={hintId}>{t("m_746adcdbc0")}</span></Dialog.Description>
      <div className="cover-framing-main">
        <div ref={setStageElement} className="cover-framing-source-stage" aria-label={t("m_e1cd619889")}>
          {ready&&sourceBox&&<div className="cover-framing-source-bounds" style={sourceBox as CSSProperties}>
            <img className="cover-framing-source" src={safeSrc} alt={t("m_8c203f8e9d")} draggable={false} onError={()=>setLoad({kind:'error',message:t("m_c1bd6edebe")})}/>
            {marker()}
          </div>}
          {load.kind==='loading'&&<div className="cover-framing-stage-status" role="status">{t("m_ff027783d4")}</div>}
          {load.kind==='error'&&<div className="cover-framing-stage-status" role="alert">{load.message}<button type="button" className="cover-framing-button" onClick={()=>setAttempt(previous=>previous+1)}>{t("m_0ad285f127")}</button></div>}
        </div>
        <div className="cover-framing-settings">
          {controls()}
        </div>
      </div>
      <section className="cover-framing-previews" aria-label={t("m_db9b20ab79")}>
        <figure><div className="cover-framing-preview cover-card-full">{ready&&<CardCoverImage src={safeSrc} alt={t("m_0f4b63cd1e")} draggable={false}/>}</div><figcaption>{t("m_8a6e0ca24b")}</figcaption></figure>
        {[{name:t("m_d072a0ef65"),ratio:'16 / 9'},{name:t("m_ff9afd34f3"),ratio:'4 / 3'}].map(preview=><figure key={preview.name}><div className="cover-framing-preview" style={{aspectRatio:preview.ratio}}>{ready&&<CoverImage src={safeSrc} frame={detailFrame} alt={t("m_22edc5889b", {v0: preview.name})} draggable={false}/>}</div><figcaption>{preview.name}</figcaption></figure>)}
      </section>
      <footer className="cover-framing-footer"><button type="button" className="cover-framing-button" disabled={!ready} onClick={resetFrames}>{t("m_ba2e93e730")}</button><p>{t("m_843c1bb9cb")}</p></footer>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
