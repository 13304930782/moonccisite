import {forwardRef,type ComponentPropsWithoutRef} from 'react';
import {coverFrameStyle,type CoverFrame} from '../lib/coverCrop';
import '../../styles/cover-framing.css';

export type CoverImageProps = ComponentPropsWithoutRef<'img'> & {frame?:CoverFrame|null};

// The caller owns clipping and layout. A missing frame preserves the existing
// image markup and object-position, including top-aligned historical hero images.
export const CoverImage=forwardRef<HTMLImageElement,CoverImageProps>(function CoverImage({frame,className,style,...props},ref) {
  const framing=coverFrameStyle(frame);
  return <img {...props} ref={ref} className={framing?`${className?`${className} `:''}cover-image--framed`:className} style={framing?{...style,...framing}:style}/>;
});
