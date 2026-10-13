import {Link} from 'react-router-dom';
import {stripLegacyAgeNotice} from '../lib/articleAge';
import '../../styles/article-summary-settings.css';

type Props={
 form:any; ai:any; owner:boolean; busy:boolean; blocked:boolean;
 onChange:(key:string,value:any)=>void; onUpdate:(value:any)=>void;
 onGenerate:()=>void; error:string;
};
export function ArticleSummaryFields({form,ai,owner,busy,blocked,onChange,onUpdate,onGenerate,error}:Props){
 const summary=stripLegacyAgeNotice(form.summary),length=Array.from(summary).length;
 const automatic=form.summary_mode==='ai'||!summary.trim()&&form.summary_mode!=='manual';
 return <section className="article-settings-section article-summary-editor">
  <h2>文章简介</h2>
  <label className="article-summary-toggle">
   <input type="checkbox" checked={automatic} aria-describedby="article-summary-mode-hint" onChange={e=>onUpdate((p:any)=>({...p,summary_mode:e.target.checked?'ai':'manual',summary_receipt:''}))}/>
   <span>使用 DeepSeek 自动总结</span>
  </label>
  <div className="article-summary-help" id="article-summary-mode-hint">
   <p>{ai?.enabled?'预览或发布前，根据当前正文生成简介。':ai?.unavailable?'AI 设置暂时无法读取，可先填写手写简介。':'启用 AI 后可自动总结，也可以手写简介。'}</p>
   {owner&&<Link className="text-link" to="/admin/ai-settings">配置 AI</Link>}
  </div>
  <label htmlFor="article-summary">文章简介</label>
  <textarea id="article-summary" rows={4} value={summary} onChange={e=>onChange('summary',e.target.value)} placeholder="介绍文章主题与主要内容" aria-describedby="article-summary-length"/>
  <div className="article-summary-meta" id="article-summary-length"><span>{length} 字</span><span>建议 80–140 字，搜索引擎可能另选摘要。</span></div>
  {form.summary_mode==='ai'&&<p className="article-summary-hint" role="status">{form.summary_receipt?'AI 简介已生成。':'预览时将根据当前正文生成简介。'}</p>}
  {error&&<p className="article-summary-error" id="article-summary-error" role="alert">{error} 可重试，或编辑简介改为手写。</p>}
  <div className="inline-actions"><button className="article-button" type="button" disabled={!ai?.enabled||busy||blocked} onClick={onGenerate} aria-describedby={error?'article-summary-error':undefined}>根据正文生成 AI 简介</button></div>
 </section>;
}
