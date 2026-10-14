import {CoverImage} from './CoverImage';
import {CardCoverImage} from './CardCoverImage';
import {coverFrame,effectiveCoverFrame,normalizeCoverCrop} from '../lib/coverCrop';

// Read-only, submitted snapshot previews. The original file remains untouched.
export function CoverDisplayPreviews({src,crop}:{src:string;crop:unknown}){
 const detail=normalizeCoverCrop(crop)?effectiveCoverFrame(coverFrame(crop,'detail'),'detail'):{x:.5,y:.3,zoom:1};
 return <section className="cover-framing-previews cover-display-previews" aria-label="封面显示范围">
  <figure className="cover-framing-preview-card"><figcaption>首页／文章列表封面 · 完整图片</figcaption><div className="cover-framing-preview cover-card-full"><CardCoverImage src={src} alt="文章卡片封面预览"/></div></figure>
  <figure><figcaption>文章详情页头图</figcaption><div className="cover-framing-preview" style={{aspectRatio:'16 / 9'}}><CoverImage src={src} frame={detail} alt="文章详情页封面预览"/></div></figure>
  <figure><figcaption>手机头图 · 375px 视口</figcaption><div className="cover-framing-preview" style={{aspectRatio:'4 / 3'}}><CoverImage src={src} frame={detail} alt="手机详情页封面预览"/></div></figure>
 </section>;
}
