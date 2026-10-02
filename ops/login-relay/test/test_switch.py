import importlib.util,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from subprocess import CompletedProcess
spec=importlib.util.spec_from_file_location("switch",Path(__file__).parents[1]/"switch-cn.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class SwitchTests(unittest.TestCase):
 def test_replaces_duplicates_preserves_other_values(self):
  source="SECRET=untouched\nexport GOOGLE_CERTS_URL=https://old\nGOOGLE_CERTS_URL=https://older\n"
  result=m.replace_urls(source,m.NEW)
  self.assertIn("SECRET=untouched",result)
  self.assertNotIn("https://old",result)
  self.assertEqual(result.count("GOOGLE_CERTS_URL="+m.NEW["GOOGLE_CERTS_URL"]),2)
 def scenario(self,fail):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);env=root/".env";home=root/"pm2";home.mkdir();(home/"rpc.sock").touch()
   old={"GOOGLE_CERTS_URL":"https://google-certs.cuegroveapp.com/google-certs","GITHUB_OAUTH_PROXY_URL":"https://github-auth.cuegroveapp.com"}
   parsed={**old,"GITHUB_OAUTH_PROXY_KEY":"a"*64}
   original="".join(k+"="+v+"\n" for k,v in parsed.items());env.write_text(original)
   state={**parsed,"status":"online"};commands=[]
   def run(args,**kwargs):
    self.assertNotIn("capture_output",kwargs)
    self.assertNotIn("text",kwargs)
    self.assertTrue(kwargs.get("universal_newlines"))
    commands.append(args)
    if "restart" in args:
     for value in args:
      if value.startswith(tuple(k+"=" for k in old)):
       k,v=value.split("=",1);state[k]=v
    output=json.dumps([{"name":"mooncci-api","pm2_env":state}]) if "jlist" in args else ""
    return CompletedProcess(args,0,output,"")
   def check_output(args,**kwargs):
    self.assertNotIn("text",kwargs)
    self.assertTrue(kwargs.get("universal_newlines"))
    return json.dumps(parsed)
   class Response:
    def __init__(self,url):self.url=url
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def read(self):return json.dumps({"ok":not fail,"service":self.url.rsplit("/",1)[1]}).encode()
   class Opener:
    def open(self,url,**kwargs):return Response(url)
   originalpath=m.Path
   def redirectpath(value,*parts):return root/"backup" if value=="/www/backup" else originalpath(value,*parts)
   with patch.object(m,"SERVER",root),patch.object(m,"ENV",env),patch.object(m,"PM2HOME",str(home)),patch.object(m,"Path",side_effect=redirectpath),patch.object(m.os,"geteuid",return_value=0,create=True),patch.object(m.os,"fchown",create=True),patch.object(m.os,"fchmod",create=True),patch.object(m.subprocess,"run",side_effect=run),patch.object(m.subprocess,"check_output",side_effect=check_output),patch.object(m.urllib.request,"build_opener",return_value=Opener()):
    if fail:
     with self.assertRaises(RuntimeError):m.main()
     self.assertEqual(env.read_text(),original)
     for k in old:self.assertEqual(state[k],old[k])
    else:
     m.main()
     for k in old:self.assertEqual(state[k],m.NEW[k]);self.assertIn(m.NEW[k],env.read_text())
    self.assertTrue(any("save" in c for c in commands))
    self.assertTrue(all(c[c.index("restart")+1]=="mooncci-api" for c in commands if "restart" in c))
 def test_success_updates_process_and_file(self):self.scenario(False)
 def test_failed_health_restores_file_and_process(self):self.scenario(True)
if __name__=="__main__":unittest.main()
