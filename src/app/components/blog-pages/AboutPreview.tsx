import {AboutContent,type AboutData} from '../AboutContent';
export function AboutPreview({about}:{about:AboutData}){
 return <aside className="bp-preview" aria-label="关于我实时预览"><div className="bp-preview-title"><strong>实时预览</strong><span className="bp-badge">与公开页面同步</span></div><div className="bp-preview-box">{about.enabled?<AboutContent about={about}/>:<p className="bp-empty">公开介绍已关闭</p>}</div></aside>;
}
