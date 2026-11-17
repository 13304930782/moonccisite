const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
const {fixture:i18nFixture,translate}=require('./helpers/i18n.cjs');
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.children?text(node.children):'';

test('English mailbox request rows translate every provision status using the existing catalog',async()=>{
 const statuses=['pending','provisioning','active','rejected','revoked'];
 const requests=statuses.map((status,index)=>({user_id:index+1,username:'fixture',account_email:'fixture@example.invalid',requested_local_part:'fixture'+index,reason:'fixture',status,mailbox_address:null,daily_limit:10,review_note:null,created_at:'2026-11-17'}));
 const mocks={'../i18n':{useI18n:()=>({locale:'en',t:(key,params)=>translate('en',key,params)})},'../lib/api':{api:async()=>({requests,counts:{},total:5,page:1,limit:25})},'../components/admin/AdminState':{AdminError:()=>null,AdminLoading:()=>null}};
 const mod={exports:{}},code=ts.transpileModule(fs.readFileSync('src/app/pages/AdminMailboxRequestsPage.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('exports','require',code)(mod.exports,name=>mocks[name]||i18nFixture(name)||(name.endsWith('.css')?{}:require(name)));
 let root;try{await act(async()=>{root=create(React.createElement(mod.exports.default));});assert.deepEqual(root.root.findAllByProps({className:'mailbox-review-status'}).map(text),['Pending review','Provisioning needs verification','Provisioned','Not approved','Disabled']);}finally{if(root)await act(async()=>root.unmount());}
});
