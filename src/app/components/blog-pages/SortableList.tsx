import {useRef,useState,type ReactNode,type PointerEvent,type CSSProperties} from 'react';

export function moveItem<T>(items:readonly T[],from:number,to:number):T[] {
 const next=[...items];
 if(from<0||to<0||from>=items.length||to>=items.length||from===to)return next;
 const [item]=next.splice(from,1);next.splice(to,0,item);return next;
}
type Drag={pointerId:number;from:number;to:number;startY:number;delta:number;scrollY:number;tops:number[];heights:number[];gap:number};
type Props<T>={items:T[];onReorder:(items:T[])=>void;getKey:(item:T)=>string;getLabel:(item:T)=>string;children:(item:T,index:number,handle:ReactNode)=>ReactNode;disabled?:boolean;className?:string};
export function SortableList<T>({items,onReorder,getKey,getLabel,children,disabled=false,className=''}:Props<T>){
 const root=useRef<HTMLDivElement>(null),active=useRef<Drag|null>(null);
 const [drag,setDrag]=useState<Drag|null>(null),[announcement,setAnnouncement]=useState('');
 const finish=(event:PointerEvent,commit:boolean)=>{
  const current=active.current;if(!current||event.pointerId!==current.pointerId)return;
  active.current=null;setDrag(null);
  if(commit&&current.from!==current.to){onReorder(moveItem(items,current.from,current.to));setAnnouncement(`${getLabel(items[current.from])}已移到第 ${current.to+1} 项`);}
 };
 const start=(event:PointerEvent<HTMLButtonElement>,index:number)=>{
  if(disabled||items.length<2||!event.isPrimary||event.button!==0||active.current)return;
  const rows=Array.from(root.current!.children).filter(node=>node.hasAttribute('data-sortable-item')) as HTMLElement[];
  const rects=rows.map(node=>node.getBoundingClientRect());
  const current:Drag={pointerId:event.pointerId,from:index,to:index,startY:event.clientY,delta:0,scrollY:window.scrollY,tops:rects.map(rect=>rect.top),heights:rects.map(rect=>rect.height),gap:rects.length>1?rects[1].top-rects[0].bottom:0};
  event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);active.current=current;setDrag(current);
 };
 const move=(event:PointerEvent<HTMLButtonElement>)=>{
  const current=active.current;if(!current||event.pointerId!==current.pointerId)return;
  const delta=event.clientY-current.startY+window.scrollY-current.scrollY;
  const center=current.tops[current.from]+current.heights[current.from]/2+delta;
  let to=current.from;
  if(delta>0){while(to<items.length-1&&center>current.tops[to+1]+current.heights[to+1]/2)to++;}
  else{while(to>0&&center<current.tops[to-1]+current.heights[to-1]/2)to--;}
  const next={...current,to,delta};active.current=next;setDrag(next);
 };
 const position=(index:number):CSSProperties|undefined=>{
  if(!drag)return;
  if(index===drag.from)return {transform:`translateY(${drag.delta}px)`,position:'relative',zIndex:2};
  const order=moveItem(items.map((_,i)=>i),drag.from,drag.to);
  let top=drag.tops[0];
  for(const i of order){if(i===index)break;top+=drag.heights[i]+drag.gap;}
  return {transform:`translateY(${top-drag.tops[index]}px)`};
 };
 return <div ref={root} className={`bp-sortable-list ${className}`}>
  {items.map((item,index)=><div key={getKey(item)} data-sortable-item="" data-dragging={drag?.from===index||undefined} className="bp-sortable-item" style={position(index)}>{children(item,index,<button type="button" className="bp-drag-handle" style={{touchAction:'none'}} aria-label={`拖动排序：${getLabel(item)}`} title="拖动排序，或使用上下方向键" disabled={disabled||items.length<2} onPointerDown={event=>start(event,index)} onPointerMove={move} onPointerUp={event=>finish(event,true)} onPointerCancel={event=>finish(event,false)} onLostPointerCapture={event=>finish(event,false)} onKeyDown={event=>{if(event.key==='Escape'&&active.current){active.current=null;setDrag(null);event.preventDefault();return;}if(drag||disabled||!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const to=index+(event.key==='ArrowUp'?-1:1);if(to<0||to>=items.length)return;onReorder(moveItem(items,index,to));setAnnouncement(`${getLabel(item)}已移到第 ${to+1} 项`);}}>⠿</button>)}</div>)}
  <span className="bp-sort-announcement" role="status" aria-live="polite">{announcement}</span>
 </div>;
}
