// Run on CN as root; outputs only a path, never a secret.
const fs=require('node:fs');
const dotenv=require('/www/wwwroot/mooncci-source/server/node_modules/dotenv');
const env=dotenv.parse(fs.readFileSync('/www/wwwroot/mooncci-source/server/.env'));
const key=env.GITHUB_OAUTH_PROXY_KEY||'';
if(!/^[a-f0-9]{64}$/.test(key))throw Error('Existing key missing or malformed');
const path='/root/mooncci-login-relay.env';
fs.writeFileSync(path,'GITHUB_OAUTH_PROXY_KEY='+key+'\n',{mode:0o600,flag:'wx'});
console.log('Created '+path+' (contains only relay key; transfer privately)');
