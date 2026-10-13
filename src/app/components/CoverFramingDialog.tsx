import {useEffect,useId,useLayoutEffect,useRef,useState,type CSSProperties,type KeyboardEvent,type PointerEvent} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import {Monitor,RotateCcw,Smartphone} from 'lucide-react';
import {CoverImage} from './CoverImage';
import {coverGeometry,effectiveCoverFrame,normalizeCoverCrop,panCoverFrame,type CoverCrop,type CoverFrame,type CoverSize,type CoverTarget} from '../lib/coverCrop';
import {safeImageSrc} from '../lib/safeUrl';
import '../../styles/cover-framing.css';

type LoadState = {kind:'loading'}|{kind:'ready';size:CoverSize}|{kind:'error';message:string};
type Drag = {pointerId:number;clientX:number;clientY:number;frame:CoverFrame;target:CoverTarget;viewport:CoverSize};
const sameFrame=(a:CoverFrame,b:CoverFrame)=>a.x===b.x && a.y===b.y && a.zoom===b.zoom;

export function CoverFramingDialog({src,value,onConfirm,onClose}:{src:string;value:CoverCrop;onConfirm:(value:CoverCrop)=>void;onClose:()=>void}) {
  const safeSrc=safeImageSrc(src),hintId=useId(),zoomId=useId();
  const [draft,setDraft]=useState<CoverCrop>(()=>normalizeCoverCrop(value));
  const [target,setTarget]=useState<CoverTarget>('card'),[device,setDevice]=useState<'desktop'|'mobile'>('desktop');
  const [load,setLoad]=useState<LoadState>({kind:'loading'}),[attempt,setAttempt]=useState(0);
  const [viewport,setViewport]=useState<CoverSize>({width:0,height:0}),[dragging,setDragging]=useState(false);
  const [stageElement,setStageElement]=useState<HTMLDivElement|null>(null);
  const heading=useRef<HTMLHeadingElement>(null),previousFocus=useRef<HTMLElement|null>(null),drag=useRef<Drag|null>(null);
  const frame=effectiveCoverFrame(draft?.[target],target),ready=load.kind==='ready';
  const geometry=ready?coverGeometry(load.size,viewport,frame):null;
  const ratio=target==='card'?16/10:device==='desktop'?1000/400:343/240;

  useEffect(()=>{
    setDraft(normalizeCoverCrop(value));drag.current=null;setDragging(false);
  },[src]);
  useEffect(()=>{
    let active=true;
    setLoad({kind:'loading'});
    if(!safeSrc){setLoad({kind:'error',message:'封面地址无效，请关闭弹窗后更换图片。'});return;}
    const image=new Image();image.decoding='async';
    const finish=(state:LoadState)=>{if(active){clearTimeout(timer);setLoad(state);}};
    const timer=setTimeout(()=>finish({kind:'error',message:'图片加载超时，请重试。'}),20000);
    image.onload=()=>finish(image.naturalWidth>0 && image.naturalHeight>0
      ?{kind:'ready',size:{width:image.naturalWidth,height:image.naturalHeight}}
      :{kind:'error',message:'图片尺寸不可用，请更换图片。'});
    image.onerror=()=>finish({kind:'error',message:'图片加载失败，请确认地址可以访问后重试。'});
    image.src=safeSrc;
    return()=>{active=false;clearTimeout(timer);image.onload=null;image.onerror=null;};
  },[safeSrc,attempt]);
  useLayoutEffect(()=>{
    const element=stageElement;if(!element)return;
    const measure=()=>{const bounds=element.getBoundingClientRect();setViewport({width:bounds.width,height:bounds.height});drag.current=null;setDragging(false);};
    measure();const observer=new ResizeObserver(measure);observer.observe(element);
    return()=>observer.disconnect();
  },[stageElement,target,device]);

  function changeFrame(next:CoverFrame,selected:CoverTarget=target) {
    setDraft(previous=>{
      if(sameFrame(effectiveCoverFrame(previous?.[selected],selected),next))return previous;
      return {...(previous ?? {card:null,detail:null}),[selected]:next};
    });
  }
  function endDrag(event:PointerEvent<HTMLDivElement>) {
    if(drag.current?.pointerId!==event.pointerId)return;
    drag.current=null;setDragging(false);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function beginDrag(event:PointerEvent<HTMLDivElement>) {
    if(!ready || !geometry || event.button!==0 || !event.isPrimary)return;
    event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);
    drag.current={pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,frame,target,viewport};setDragging(true);
  }
  function moveDrag(event:PointerEvent<HTMLDivElement>) {
    const current=drag.current;
    if(!current || current.pointerId!==event.pointerId || load.kind!=='ready')return;
    changeFrame(panCoverFrame(current.frame,load.size,current.viewport,event.clientX-current.clientX,event.clientY-current.clientY),current.target);
  }
  function moveKey(event:KeyboardEvent<HTMLDivElement>) {
    if(load.kind!=='ready' || event.altKey || event.ctrlKey || event.metaKey)return;
    const distance=event.shiftKey?40:10;
    const directions:Record<string,[number,number]>={ArrowLeft:[-distance,0],ArrowRight:[distance,0],ArrowUp:[0,-distance],ArrowDown:[0,distance]};
    const delta=directions[event.key];if(!delta)return;
    event.preventDefault();changeFrame(panCoverFrame(frame,load.size,viewport,...delta));
  }
  function resetFrame() {
    setDraft(previous=>normalizeCoverCrop({...previous,[target]:null}));
  }
  const stageStyle={'--cover-stage-ratio':ratio} as CSSProperties;
  const sourceStyle=geometry?{width:geometry.width,height:geometry.height,left:geometry.left,top:geometry.top}:undefined;
  const detailFrame=effectiveCoverFrame(draft?.detail,'detail');

  return <Dialog.Root open onOpenChange={open=>{if(!open)onClose();}}><Dialog.Portal>
    <Dialog.Overlay className="cover-framing-overlay"/>
    <Dialog.Content className="cover-framing-dialog" onOpenAutoFocus={event=>{
      previousFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
      event.preventDefault();heading.current?.focus();
    }} onCloseAutoFocus={event=>{
      if(previousFocus.current?.isConnected){event.preventDefault();previousFocus.current.focus();}
    }}>
      <header className="cover-framing-header"><Dialog.Close className="cover-framing-button">取消</Dialog.Close><Dialog.Title ref={heading} tabIndex={-1}>调整封面取景</Dialog.Title><button type="button" className="cover-framing-button cover-framing-confirm" disabled={!ready} onClick={()=>onConfirm(normalizeCoverCrop(draft))}>确定</button></header>
      <Dialog.Description className="cover-framing-description">文章卡片与详情头图可以分别调整。拖动图片，或聚焦取景框后用方向键移动。</Dialog.Description>
      <Tabs.Root value={target} onValueChange={selected=>{drag.current=null;setDragging(false);setTarget(selected as CoverTarget);}} className="cover-framing-tabs">
        <Tabs.List className="cover-framing-tablist" aria-label="封面展示位置"><Tabs.Trigger value="card">文章卡片 <small>16:10</small></Tabs.Trigger><Tabs.Trigger value="detail">详情头图</Tabs.Trigger></Tabs.List>
        <Tabs.Content value={target} className="cover-framing-panel">
          <div className="cover-framing-scroll">
            <div className="cover-framing-section-heading"><h3>{target==='card'?'卡片取景':'详情取景'}</h3>{target==='detail'&&<div className="cover-framing-devices" role="group" aria-label="详情取景视口"><button type="button" aria-pressed={device==='desktop'} onClick={()=>setDevice('desktop')}><Monitor size={16} aria-hidden="true"/>桌面</button><button type="button" aria-pressed={device==='mobile'} onClick={()=>setDevice('mobile')}><Smartphone size={16} aria-hidden="true"/>手机</button></div>}</div>
            <div className="cover-framing-canvas" data-dragging={dragging||undefined}>
              <div ref={setStageElement} className="cover-framing-viewport" style={stageStyle} role="region" aria-label={target==='card'?'文章卡片取景框':'详情头图取景框'} aria-describedby={hintId} aria-disabled={!ready} tabIndex={ready?0:-1} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={event=>{if(drag.current?.pointerId===event.pointerId){drag.current=null;setDragging(false);}}} onKeyDown={moveKey}>
                {ready && geometry && <img className="cover-framing-source" src={safeSrc} alt="" draggable={false} style={sourceStyle} onError={()=>setLoad({kind:'error',message:'图片加载失败，请重试。'})}/>}
                <span className="cover-framing-selection" aria-hidden="true"/>
                {load.kind==='loading'&&<div className="cover-framing-stage-status" role="status">正在加载封面…</div>}
                {load.kind==='error'&&<div className="cover-framing-stage-status" role="alert">{load.message}</div>}
              </div>
            </div>
            <div className="cover-framing-hint" id={hintId}><p>亮区是显示范围，暗区是框外的原图。方向键移动 10px，按住 Shift 移动 40px。</p>{load.kind==='error'&&<button type="button" className="cover-framing-button" onClick={()=>setAttempt(previous=>previous+1)}>重新加载图片</button>}</div>
            <div className="cover-framing-controls"><label htmlFor={zoomId}>缩放 <output htmlFor={zoomId}>{Math.round(frame.zoom*100)}%</output></label><input id={zoomId} type="range" min="1" max="3" step=".01" value={frame.zoom} aria-label="封面缩放" aria-valuetext={`${Math.round(frame.zoom*100)}%`} disabled={!ready} onChange={event=>changeFrame({...frame,zoom:Number(event.target.value)})}/><button type="button" className="cover-framing-button" disabled={!draft?.[target]} onClick={resetFrame}><RotateCcw size={16} aria-hidden="true"/>恢复默认</button></div>
            {ready && <section className="cover-framing-previews" aria-label="封面展示预览">
              {target==='card'?<figure className="cover-framing-preview-card"><figcaption>文章卡片预览</figcaption><div className="cover-framing-preview" style={{aspectRatio:'16 / 10'}}><CoverImage src={safeSrc} frame={frame} alt="文章卡片取景预览" draggable={false}/></div></figure>:<>
                <figure><figcaption><Monitor size={16} aria-hidden="true"/>桌面头图 <small>1000 × 400</small></figcaption><div className="cover-framing-preview" style={{aspectRatio:'1000 / 400'}}><CoverImage src={safeSrc} frame={detailFrame} alt="桌面详情头图取景预览" draggable={false}/></div></figure>
                <figure><figcaption><Smartphone size={16} aria-hidden="true"/>手机头图 <small>375px 视口</small></figcaption><div className="cover-framing-preview cover-framing-preview-phone" style={{aspectRatio:'343 / 240'}}><CoverImage src={safeSrc} frame={detailFrame} alt="手机详情头图取景预览" draggable={false}/></div></figure>
              </>}
            </section>}
          </div>
        </Tabs.Content>
      </Tabs.Root>
      <footer className="cover-framing-footer"><p>确定后应用两种取景；取消保留原设置。</p></footer>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
