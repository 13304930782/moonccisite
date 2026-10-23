export function SaveBar({dirty,saving,onDiscard,onSave}:{dirty:boolean;saving:boolean;onDiscard:()=>void;onSave:()=>void}) {
  return <header className="bp-save-bar">
    <div><h1>关于与友链</h1><p>维护公开介绍、社交链接和友情链接。</p></div>
    <div className="bp-save-actions"><span className="bp-save-status" role="status">{saving?'正在保存…':dirty?'有未保存的更改':'已保存'}</span>
      <button type="button" disabled={!dirty||saving} onClick={onDiscard}>放弃更改</button>
      <button type="button" className="bp-primary" disabled={!dirty||saving} onClick={onSave}>{saving?'正在保存…':'保存设置'}</button>
    </div>
  </header>;
}
