const definitions=require('./mailChannelDefinitions.json');
const fail=message=>Object.assign(new Error(message),{status:400});
const validAddress=value=>typeof value==='string'&&value.length<=254&&/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
function checkChannel(channel){if(!Object.hasOwn(definitions,channel))throw fail('无效的邮件业务。');return channel;}
function profiles(config){return Object.fromEntries(Object.entries(definitions).map(([key,d])=>[key,{mode:'inherit',address:d.address,name:d.name,reply_to:d.reply_to,password:'',...(config.channels?.[key]||{})}]));}
function publicProfiles(config){return Object.fromEntries(Object.entries(profiles(config)).map(([key,p])=>[key,{mode:p.mode,address:p.address,name:p.name,reply_to:p.reply_to,password:'',has_password:Boolean(p.password)}]));}
function mergeProfiles(input,old){
 const previous=profiles(old);if(input===undefined)return old.channels||{};
 if(!input||typeof input!=='object'||Array.isArray(input))throw fail('邮件业务配置格式无效。');
 for(const key of Object.keys(input)){
  checkChannel(key);const value=input[key];if(!value||typeof value!=='object'||Array.isArray(value))throw fail('邮件业务配置格式无效。');
  const p={...previous[key]};for(const field of ['mode','address','name','reply_to'])if(Object.hasOwn(value,field)){if(typeof value[field]!=='string')throw fail('邮件设置必须填写文字。');p[field]=value[field].trim();}
  if(!['inherit','custom'].includes(p.mode))throw fail('请选择默认账号或独立账号。');
  if(!validAddress(p.address)||!validAddress(p.reply_to))throw fail(definitions[key].label+'：请填写完整的发件邮箱和回复邮箱。');
  if(!p.name||p.name.length>80||/[\r\n\x00]/.test(p.name))throw fail(definitions[key].label+'：发件名称须为 1–80 字且不能换行。');
  if(Object.hasOwn(value,'password')&&typeof value.password!=='string')throw fail('邮箱密码格式无效。');
  if(value.password){if(value.password.length>1024)throw fail('邮箱密码过长。');p.password=value.password;}
  else if(p.address.toLowerCase()!==previous[key].address.toLowerCase())p.password='';
  if(p.mode==='custom'&&!p.password)throw fail(definitions[key].label+'：使用独立账号前，请填写该邮箱在宝塔邮局设置的密码。');
  previous[key]=p;
 }
 return previous;
}
function resolveConfig(config,channel='account'){
 checkChannel(channel);const p=profiles(config)[channel];
 if(p.mode!=='custom')return {...config,mail_channel:channel};
 // Never borrow another mailbox password or silently retry through the default account.
 return {...config,smtp_user:p.address,smtp_from:p.address,smtp_pass:p.password||'',sender_name:p.name,reply_to:p.reply_to,mail_channel:channel};
}
module.exports={definitions,validAddress,checkChannel,publicProfiles,mergeProfiles,resolveConfig};
