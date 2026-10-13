export function focusableWithin(container:HTMLElement):HTMLElement[] {
 const win=container.ownerDocument.defaultView;
 return Array.from(container.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,summary,[tabindex]')).filter(node=>{
  if(node.tabIndex<0||node.matches(':disabled'))return false;
  for(let parent:HTMLElement|null=node;parent;parent=parent.parentElement){
   if(parent.hidden||parent.hasAttribute('inert'))return false;
   const style=win?.getComputedStyle(parent);
   if(style?.display==='none'||style?.visibility==='hidden')return false;
   if(parent.tagName==='DETAILS'&&!(parent as HTMLDetailsElement).open&&!parent.querySelector('summary')?.contains(node))return false;
   if(parent===container)break;
  }
  return true;
 });
}
export function loopFocus(event:KeyboardEvent,container:HTMLElement) {
 if(event.key!=='Tab')return;
 const items=focusableWithin(container),first=items[0],last=items.at(-1),current=container.ownerDocument.activeElement;
 if(!first){event.preventDefault();container.focus({preventScroll:true});return;}
 if(!container.contains(current)||event.shiftKey&&current===first||!event.shiftKey&&current===last){
  event.preventDefault();(event.shiftKey?last:first)?.focus({preventScroll:true});
 }
}
