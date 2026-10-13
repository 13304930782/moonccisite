import {CoverImage} from './CoverImage';
import {coverFrame,effectiveCoverFrame} from '../lib/coverCrop';

// Read-only, submitted snapshot previews. The original file remains untouched.
export function CoverDisplayPreviews({src,crop}:{src:string;crop:unknown}){
 const card=effectiveCoverFrame(coverFrame(crop,'card'),'card');
 const detail=effectiveCoverFrame(coverFrame(crop,'detail'),'detail');
 return <section className="cover-framing-previews cover-display-previews" aria-label="封面显示范围">
  <figure><figcaption>首页／文章列表封面</figcaption><div className="cover-framing-preview" style={{aspectRatio:'16 / 10'}}><CoverImage src={src} frame={card} alt="文章卡片封面预览"/></div></figure>
  <figure><figcaption>文章详情页头图</figcaption><div className="cover-framing-preview" style={{aspectRatio:'1000 / 400'}}><CoverImage src={src} frame={detail} alt="文章详情页封面预览"/></div></figure>
  <figure><figcaption>手机头图 · 375px 视口</figcaption><div className="cover-framing-preview cover-framing-preview-phone" style={{aspectRatio:'343 / 240'}}><CoverImage src={src} frame={detail} alt="手机详情页封面预览"/></div></figure>
 </section>;
}
