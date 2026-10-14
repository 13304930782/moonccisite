export function edgeColor(pixels:Uint8ClampedArray,size=32):[number,number,number]|null {
 if(size<4||pixels.length!==size*size*4)return null;
 let r=0,g=0,b=0,n=0;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  if(x>1&&x<size-2&&y>1&&y<size-2)continue;
  const p=(y*size+x)*4;
  if(!pixels[p+3])continue;
  r+=pixels[p];g+=pixels[p+1];b+=pixels[p+2];n++;
 }
 return n?[Math.round(r/n),Math.round(g/n),Math.round(b/n)]:null;
}
export function bandGradient(rgb:[number,number,number]):string {
 if((.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2])/255>.75)
  return 'linear-gradient(to bottom, #2b2d30, #1e1f22)';
 const [r,g,b]=rgb.map(v=>Math.min(255,Math.max(0,v))/255);
 const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
 let h=0,s=0,l=(max+min)/2;
 if(d){s=l>.5?d/(2-max-min):d/(max+min);h=(max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4)*60;}
 s=Math.min(s,.4);l=Math.min(Math.max(l,.08),.28);
 const color=(light:number)=>`hsl(${Math.round(h)} ${(s*100).toFixed(1)}% ${(light*100).toFixed(1)}%)`;
 return `linear-gradient(to bottom, ${color(l+.07)}, ${color(l)})`;
}
export function loadCoverGradient(src:string,onReady:(gradient:string)=>void):()=>void {
 let active=true;
 const image=new Image();image.crossOrigin='anonymous';image.decoding='async';
 image.onload=()=>{
  if(!active)return;
  try{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
   const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return;
   context.drawImage(image,0,0,32,32);
   const rgb=edgeColor(context.getImageData(0,0,32,32).data);
   if(rgb&&active)onReady(bandGradient(rgb));
  }catch{/* Cross-origin or unreadable images retain the stable fallback. */}
 };
 image.onerror=()=>{};image.src=src;
 return()=>{active=false;image.onload=null;image.onerror=null;};
}
