const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
const {fixture:i18nFixture}=require('./helpers/i18n.cjs');

async function mount(request){
 const requests=[],saved=[],navigations=[],focus=[],frames=new Map();let frameId=0;
 const mocks={
  FormInput:{FormInput:React.forwardRef((props,ref)=>React.createElement('input',{...props,ref}))},
  ThemeSelect:{ThemeSelect:({onValueChange,...props})=>React.createElement('select',{...props,onChange:event=>onValueChange(event.target.value)})},
  api:{api:async(path,options)=>{requests.push({path,method:options.method,body:JSON.parse(options.body)});return request(path,options);}},
 };
 const code=ts.transpileModule(fs.readFileSync('src/app/components/AccountEmailForm.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exported={};
 new Function('exports','require','window','requestAnimationFrame','cancelAnimationFrame',code)(exported,name=>i18nFixture(name)||mocks[name.split('/').at(-1)]||(name==='lucide-react'?{ChevronDown:'svg'}:require(name)),{location:{assign:url=>navigations.push(url)}},callback=>{frames.set(++frameId,callback);return frameId;},id=>frames.delete(id));
 let tree;
 await act(async()=>{tree=create(React.createElement(exported.AccountEmailForm,{user:{id:1,email:'old@example.test'},providers:[{provider:'google',name:'Google',bound:true,enabled:true},{provider:'github',name:'GitHub',bound:false,enabled:true},{provider:'disabled',name:'Disabled',bound:true,enabled:false}],onSaved:user=>saved.push(user)}),{createNodeMock:element=>({focus:()=>{
   focus.push(element.props.autoComplete==='one-time-code'?'code':element.props.type==='email'?'email':'trigger');
  }})});});
 const trigger=()=>tree.root.findByType('summary');
 const disclosure=()=>tree.root.findByType('details');
 const input=type=>tree.root.findAllByType('input').find(node=>type==='code'?node.props.autoComplete==='one-time-code':node.props.type===type);
 const settle=async action=>{await act(action);await act(async()=>{const pending=[...frames.values()];frames.clear();for(const callback of pending)callback();});};
 const edit=(type,value)=>settle(async()=>input(type).props.onChange({target:{value}}));
 const submit=index=>settle(async()=>tree.root.findAllByType('form')[index].props.onSubmit({preventDefault(){}}));
 const toggle=()=>settle(async()=>trigger().props.onClick({preventDefault(){}}));
 return {tree,requests,saved,navigations,focus,trigger,disclosure,input,edit,submit,toggle,close:()=>act(async()=>tree.unmount())};
}
const challenge={challenge_id:'challenge-1',message:'验证码已发送。'};
async function verifyStep(h){await h.toggle();await h.edit('email','fresh@example.test');await h.submit(0);}

test('email disclosure stages the request, recovers from send failure and clears credentials on edit/cancel',async()=>{
 let fail=true;
 const h=await mount(async()=>{if(fail)throw Error('邮件暂时不可用');return challenge;});
 try{
  assert.equal(h.trigger().props['aria-expanded'],false);assert.equal(h.disclosure().props.open,false);assert.equal(h.input('email').props.value,'');assert.equal(h.input('code'),undefined);
  await h.toggle();assert.equal(h.tree.root.findAllByType('form').length,1);assert.equal(h.input('email').props.required,true);assert.equal(h.focus.at(-1),'email');
  await h.edit('email','fresh@example.test');await h.submit(0);
  assert.equal(h.tree.root.findByProps({role:'alert'}).children.join(''),'邮件暂时不可用');assert.equal(h.input('email').props.value,'fresh@example.test');assert.equal(h.tree.root.findAllByType('form').length,1);
  fail=false;await h.submit(0);
  assert.deepEqual(h.requests.at(-1),{path:'/account/email-code',method:'POST',body:{email:'fresh@example.test'}});
  assert.equal(h.tree.root.findAllByType('form').length,2);assert.equal(h.focus.at(-1),'code');
  await h.edit('code','12x3456');assert.equal(h.input('code').props.value,'123456');await h.edit('password','secret-only-in-memory');
  const select=()=>h.tree.root.findByType('select');assert.deepEqual(select().findAllByType('option').map(node=>node.props.value),['password','google']);
  await act(async()=>select().props.onChange({target:{value:'google'}}));assert.equal(h.input('password'),undefined);
  await act(async()=>select().props.onChange({target:{value:'password'}}));assert.equal(h.input('password').props.value,'');
  await h.edit('password','discard-on-email-change');await h.edit('email','other@example.test');assert.equal(h.tree.root.findAllByType('form').length,1);
  await h.submit(0);assert.equal(h.input('password').props.value,'');await h.edit('code','654321');await h.edit('password','discard-on-cancel');
  await h.toggle();assert.equal(h.disclosure().props.open,false);assert.equal(h.input('email').props.value,'');assert.equal(h.input('code'),undefined);assert.equal(h.input('password'),undefined);assert.equal(h.tree.root.findAllByProps({role:'status'}).length,0);assert.equal(h.focus.at(-1),'trigger');
  await h.toggle();assert.equal(h.input('email').props.value,'');assert.equal(h.tree.root.findAllByType('form').length,1);assert.equal(h.input('code'),undefined);
  await h.edit('email','fresh@example.test');await h.submit(0);await act(async()=>select().props.onChange({target:{value:'google'}}));await h.toggle();await h.toggle();
  await h.edit('email','fresh@example.test');await h.submit(0);assert.equal(select().props.value,'password');assert.equal(h.input('password').props.value,'');
 }finally{await h.close();}
});

test('password confirmation preserves failed inputs and collapses successful change with the original API body',async()=>{
 let fail=true;
 const h=await mount(async path=>path.endsWith('email-code')?challenge:fail?Promise.reject(Error('当前密码错误')):{user:{id:1,email:'fresh@example.test'},message:'邮箱已更新。'});
 try{
  await verifyStep(h);await h.edit('code','123456');await h.edit('password','existing-password');await h.submit(1);
  assert.deepEqual(h.requests.at(-1),{path:'/account/email',method:'POST',body:{challenge_id:'challenge-1',new_code:'123456',password:'existing-password'}});
  assert.equal(h.tree.root.findByProps({role:'alert'}).children.join(''),'当前密码错误');assert.equal(h.input('password').props.value,'existing-password');assert.equal(h.input('code').props.value,'123456');assert.deepEqual(h.saved,[]);
  fail=false;await h.submit(1);assert.deepEqual(h.saved,[{id:1,email:'fresh@example.test'}]);assert.equal(h.trigger().props['aria-expanded'],false);assert.equal(h.tree.root.findByProps({role:'status'}).children.join(''),'邮箱已更新。');assert.equal(h.focus.at(-1),'trigger','success returns focus after the trigger is enabled');
  await h.toggle();assert.equal(h.input('email').props.value,'');assert.equal(h.input('password'),undefined);
 }finally{await h.close();}
});

test('linked-provider confirmation sends challenge proof without a password and uses the returned authorization URL',async()=>{
 const h=await mount(async path=>path.endsWith('email-code')?challenge:{url:'https://oauth.example.test/authorize'});
 try{
  await verifyStep(h);await h.edit('code','123456');await h.edit('password','must-not-leave-client');
  await act(async()=>h.tree.root.findByType('select').props.onChange({target:{value:'google'}}));await h.submit(1);
  assert.deepEqual(h.requests.at(-1),{path:'/auth/google/start',method:'POST',body:{challenge_id:'challenge-1',new_code:'123456',mode:'email'}});
  assert.deepEqual(h.navigations,['https://oauth.example.test/authorize']);assert.deepEqual(h.saved,[]);
 }finally{await h.close();}
});

test('pending requests lock cancellation and duplicate submission until the result is applied',async()=>{
 let resolve;
 const h=await mount(()=>new Promise(done=>{resolve=done;}));
 try{
  await h.toggle();await h.edit('email','fresh@example.test');await h.submit(0);assert.equal(h.trigger().props['aria-disabled'],true);
  await h.toggle();assert.equal(h.trigger().props['aria-expanded'],true);await h.submit(0);assert.equal(h.requests.length,1);
  await act(async()=>resolve(challenge));assert.equal(h.trigger().props['aria-disabled'],false);assert.equal(h.tree.root.findAllByType('form').length,2);
  await h.edit('code','123456');await h.edit('password','existing-password');await h.submit(1);assert.equal(h.trigger().props['aria-disabled'],true);
  await h.toggle();await h.submit(1);assert.equal(h.requests.length,2);
  await act(async()=>resolve({user:{id:1,email:'fresh@example.test'},message:'已完成'}));assert.equal(h.trigger().props['aria-expanded'],false);assert.equal(h.saved.length,1);
 }finally{await h.close();}
});
