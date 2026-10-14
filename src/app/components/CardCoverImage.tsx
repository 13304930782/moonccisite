import type {ComponentPropsWithoutRef} from 'react';
import {safeImageSrc} from '../lib/safeUrl';
import {responsiveImage} from '../lib/responsiveImage';
import '../../styles/card-cover.css';

type Props=Omit<ComponentPropsWithoutRef<'img'>,'src'> & {src:string; responsive?:boolean};

// Small covers always show the original aspect ratio. Crop metadata belongs
// exclusively to the detail hero; it is never consumed or mutated here.
export function CardCoverImage({src,responsive=false,className,...props}:Props){
 const safeSrc=safeImageSrc(src);
 if(!safeSrc)return null;
 return <img {...(responsive?responsiveImage(safeSrc):{src:safeSrc})} {...props} className={`card-cover-image${className?' '+className:''}`}/>;
}
