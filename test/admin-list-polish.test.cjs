const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
const {fixture:i18nFixture}=require('./helpers/i18n.cjs');
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.children?text(node.children):'';
function load(file,mocks={}){
  const mod={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('exports','require',code)(mod.exports,name=>i18nFixture(name)||(name.endsWith('.css')?{}:mocks[name]||require(name)));
  return mod.exports;
}
async function fixture(name,{total=1,page=1,items=[]}={}){
  const pages=[],filters=[],writes=[];
  const Pagination=load('src/app/components/AdminPagination.tsx').AdminPagination;
  const Page=load(`src/app/pages/${name}.tsx`,{
    '../lib/useContentListQuery':{useContentListQuery:()=>({params:new URLSearchParams(),update:value=>filters.push(value)})},
    '../lib/useAdminList':{useAdminList:()=>({items,total,page,loading:false,error:'',setPage:value=>pages.push(value),reload(){}})},
    '../components/AdminPagination':{AdminPagination:Pagination},
    '../components/admin/AdminState':{AdminEmpty:({title})=>React.createElement('p',null,title),AdminError:()=>null,AdminLoading:()=>null,AdminNotice:()=>null},
    '../components/admin/AdminButton':{AdminButton:({children,asChild,variant,...props})=>asChild?React.cloneElement(children,props):React.createElement('button',props,children)},
    '../components/ThemeSelect':{ThemeSelect:({onValueChange,children,compact,...props})=>React.createElement('select',{...props,onChange:event=>onValueChange(event.target.value)},children)},
    '../lib/feedback':{notify:{success(){}}},
    '../lib/confirmAction':{confirmAction:async()=>true},
    '../lib/api':{api:async(url,options)=>{writes.push({url,body:JSON.parse(options.body)});return {}; }},
    '../lib/commentTime':{formatCommentTime:()=> '2026-11-17 09:30'},
  }).default;
  let root;await act(async()=>{root=create(React.createElement(Page));});
  return {root,pages,filters,writes,close:()=>act(()=>root.unmount())};
}

for(const name of ['AdminCommentsPage','AdminUsersPage']){
  test(`${name} single-page count stays quiet while multiple and out-of-range pages remain navigable`,async()=>{
    for(const state of [{total:1,page:1},{total:50,page:1},{total:51,page:1},{total:50,page:2}]){
      const f=await fixture(name,state);
      try{
        const nav=f.root.root.findAllByProps({className:'admin-pagination'});
        if(state.total<=50&&state.page===1){
          assert.equal(nav.length,0);
          assert.equal(text(f.root.root.findByProps({className:'admin-list-count'})),name==='AdminUsersPage'?`共 ${state.total} 项`:`共 ${state.total} 条`);
        }else{
          assert.equal(nav.length,1);
          const buttons=nav[0].findAllByType('button');
          const target=state.page===1?buttons[1]:buttons[0];
          assert.equal(target.props.disabled,false);
          await act(async()=>target.props.onClick());
          assert.deepEqual(f.pages,[state.page===1?2:1]);
        }
      }finally{f.close();}
    }
  });
}

test('comment hierarchy keeps full body, moderation controls and filter callbacks',async()=>{
  const item={id:7,status:'pending',author_name:'读者',author_email:'reader@example.test',post_title:'文章标题',content:'第一段。\n第二段，完整保留。',ip_address_masked:'203.0.*.*',created_at:'2026-11-17T01:30:00Z'};
  const f=await fixture('AdminCommentsPage',{items:[item]});
  try{
    assert.equal(text(f.root.root.findByProps({className:'admin-comment-content'})),item.content);
    assert.match(text(f.root.root.findByProps({className:'admin-comment-author'})),/读者.*reader@example.test/);
    assert.match(text(f.root.root.findByProps({className:'admin-comment-target'})),/文章标题/);
    const actions=f.root.root.findByProps({className:'admin-row-actions shrink-0'}).findAllByType('button');
    assert.equal(actions.length,4);
    await act(async()=>actions[0].props.onClick());
    assert.deepEqual(f.writes,[{url:'/admin/comments/7',body:{status:'visible'}}]);
    await act(async()=>f.root.root.findAllByType('select')[0].props.onChange({target:{value:'visible'}}));
    assert.equal(f.filters[0].status,'visible');
  }finally{f.close();}
});

test('user metadata keeps role, status, comment permission and deleted-account setting links',async()=>{
  const f=await fixture('AdminUsersPage',{items:[{id:2,username:'读者',email:'reader@example.test',role:'editor',status:'active',can_comment:true},{id:3,username:'旧账号',role:'user',status:'disabled',can_comment:false,deleted_at:'2026-11-17'}]});
  try{
    const rows=f.root.root.findAllByProps({className:'admin-user-row'});
    assert.equal(text(rows[0].findByProps({className:'admin-user-role'})),'编辑');
    assert.match(text(rows[0].findByProps({className:'admin-user-meta'})),/正常.*评论\s*允许/);
    assert.match(text(rows[1].findByProps({className:'admin-user-meta'})),/已删除.*评论\s*禁止/);
    assert.match(text(rows[0].findByProps({className:'admin-user-name'})),/#2/);
    assert.deepEqual(rows.map(row=>row.findByType('a').props.href),['/admin/users/2/settings','/admin/users/3/settings']);
  }finally{f.close();}
});
