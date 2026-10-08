import {MailChannelSettings,defaultMailProfiles} from '../components/MailChannelSettings';
import { notify } from '../lib/feedback';
import { ThemeSelect } from '../components/ThemeSelect';
import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const defaultMail = {
  enabled: 'false',
  smtp_host: '',
  smtp_port: '465',
  smtp_secure: 'true',
  smtp_user: '',
  smtp_pass: '',
  smtp_from: '',
  notify_to: '',
  site_url: 'https://mooncci.site',
  early_access_download_url: '',
  has_smtp_pass: false,
  channels: defaultMailProfiles,
};

function uploadEarlyAccessRelease(file: File, onProgress: (value: number) => void) {
  return new Promise<any>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const body = new FormData();
    body.append('file', file);

    request.open('POST', '/api/settings/mail/early-access-upload');
    request.withCredentials = true;
    request.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    request.onerror = () => reject(new Error('上传连接中断，请检查网络后重试。'));
    request.onload = () => {
      let response: any = {};

      try {
        response = JSON.parse(request.responseText || '{}');
      } catch {
        response = {};
      }

      if (request.status >= 200 && request.status < 300) {
        resolve(response);
      } else {
        reject(new Error(response.message || `上传失败（HTTP ${request.status}）。`));
      }
    };

    request.send(body);
  });
}

export default function AdminMailSettingsPage() {
  const { user } = useAuth();
  const [mail, setMail] = useState(defaultMail);
  const [saved,setSaved] = useState('');
  const [loadAttempt,setLoadAttempt] = useState(0);
  const [loadError,setLoadError] = useState('');
  const dirty = saved !== JSON.stringify(mail);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    setLoadError('');
    api('/settings/mail')
      .then((data) => {const value={...defaultMail,...data};setMail(value);setSaved(JSON.stringify(value));})
      .catch((err) => setLoadError(err.message || '邮件设置加载失败'));
  }, [loadAttempt]);

  const update = (key: string, value: string) => {
    setMail((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setMessage('');

    try {
      const res = await api('/settings/mail', {
        method: 'PUT',
        body: JSON.stringify(mail),
      });

      notify.success(res.message || '保存成功');

      if (res.mail) {
        setMail({ ...defaultMail, ...res.mail });
        setSaved(JSON.stringify({...defaultMail,...res.mail}));
      }
    } catch (err: any) {
      setMessage(err.message || '保存失败'); notify.error(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const testMail = async (channel: string) => {
    setTesting(true);
    setMessage('');

    try {
      const res = await api('/settings/mail/test', {
        method: 'POST',
        body: JSON.stringify({channel}),
      });

      notify.success(res.message || '测试邮件已发送');
    } catch (err: any) {
      setMessage(err.message || '测试邮件发送失败'); notify.error(err.message || '测试邮件发送失败');
    } finally {
      setTesting(false);
    }
  };

  const uploadRelease = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.dmg')) {
      setMessage('只允许上传 DMG 安装包。');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setMessage('');

    try {
      const response = await uploadEarlyAccessRelease(file, setUploadProgress);
      if (response.mail) {
        setMail({ ...defaultMail, ...response.mail });
        setSaved(JSON.stringify({...defaultMail,...response.mail}));
      } else if (response.url) {
        update('early_access_download_url', response.url);
      }
      setUploadProgress(100);
      setMessage(response.message || '安装包上传成功。');
    } catch (error: any) {
      setMessage(error.message || '安装包上传失败。');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="admin-page workflow-feedback">
      <div className="py-2">
        <div className="mb-8">
          <h1 className="admin-title">邮件提醒设置</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            共用一套邮件服务器，为账号、电量、通知、周报、PromptDock 和人工邮件分别设置发件邮箱。
          </p>
        </div>

        {message && (
          <div role="alert" className="mb-5 rounded-[10px] bg-muted px-4 py-3 text-sm text-foreground">
            {message}
          </div>
        )}

        {loadError&&<p role="alert">{loadError}<button className="text-link" onClick={()=>setLoadAttempt(n=>n+1)}>重新读取设置</button></p>}
        {!saved&&!loadError&&<p role="status">正在读取邮件设置…</p>}
        <fieldset disabled={!saved||saving||testing||uploading} className="space-y-6">
          <div className="admin-settings-section">
            <h2 className="text-xl font-medium text-foreground">基础开关</h2>

            <div className="mt-5">
              <label className="block mb-2 text-sm font-medium text-foreground">是否启用邮件提醒</label>
              <ThemeSelect aria-label="邮件提醒"
                value={mail.enabled}
                onValueChange={(nextValue) => update('enabled', nextValue)}

              >
                <option value="true">启用</option>
                <option value="false">关闭</option>
              </ThemeSelect>
            </div>
          </div>

          <div className="admin-settings-section">
            <h2 className="text-xl font-medium text-foreground">共用 SMTP 与默认账号</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              填写当前邮件服务提供的 SMTP 地址、端口和账号。自建邮件使用自建服务的配置；修改后先保存，再发送测试邮件。
            </p>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block mb-2 text-sm font-medium text-foreground">SMTP 服务器</label>
                <input
                  value={mail.smtp_host}
                  onChange={(e) => update('smtp_host', e.target.value)}
                  className="w-full rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                  placeholder="宝塔邮局显示的 SMTP 服务器"
                />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-foreground">SMTP 端口</label>
                <input
                  value={mail.smtp_port}
                  onChange={(e) => update('smtp_port', e.target.value)}
                  className="w-full rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                  placeholder="465"
                />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-foreground">连接加密</label>
                <ThemeSelect aria-label="连接加密"
                  value={mail.smtp_secure}
                  onValueChange={(nextValue) => update('smtp_secure', nextValue)}

                >
                  <option value="true">SSL/TLS（通常为 465）</option>
                  <option value="false">STARTTLS（通常为 587，按邮局配置）</option>
                </ThemeSelect>
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-foreground">默认 SMTP 登录邮箱</label>
                <input
                  value={mail.smtp_user}
                  onChange={(e) => update('smtp_user', e.target.value)}
                  className="w-full rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                  placeholder="websiteaccount@mooncci.site"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block mb-2 text-sm font-medium text-foreground">默认邮箱密码</label>
                <input
                  value={mail.smtp_pass}
                  onChange={(e) => update('smtp_pass', e.target.value)}
                  type="password"
                  className="w-full rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                  placeholder={mail.has_smtp_pass ? '已保存密码；不修改可留空' : '请输入 SMTP 密码'}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  为了安全，后台不会回显已保存的密码。不想修改密码就留空。
                </p>
              </div>
            </div>
          </div>

          <div className="admin-settings-section">
            <h2 className="text-xl font-medium text-foreground">发件与收件</h2>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block mb-2 text-sm font-medium text-foreground">默认发件地址</label>
                <input
                  value={mail.smtp_from}
                  onChange={(e) => update('smtp_from', e.target.value)}
                  className="w-full rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                  placeholder="mooncci <websiteaccount@mooncci.site>"
                />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-foreground">接收提醒邮箱</label>
                <input
                  value={mail.notify_to}
                  onChange={(e) => update('notify_to', e.target.value)}
                  className="w-full rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                  placeholder="接收测试与管理提醒的邮箱"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block mb-2 text-sm font-medium text-foreground">站点地址</label>
                <input
                  value={mail.site_url}
                  onChange={(e) => update('site_url', e.target.value)}
                  className="w-full rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                  placeholder="https://mooncci.site"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block mb-2 text-sm font-medium text-foreground">Early Access 下载地址</label>
                <input
                  value={mail.early_access_download_url}
                  onChange={(e) => update('early_access_download_url', e.target.value)}
                  type="url"
                  className="w-full rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                  placeholder="https://downloads.example.com/PromptDock.dmg"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  必须使用 HTTPS。未配置时，Early Access 申请可以查看和拒绝，但无法批准。
                </p>
                {user?.role === 'owner' ? (
                  <div className="mt-4 rounded-[10px] border border-border bg-muted p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className={`inline-flex cursor-pointer items-center rounded-[10px] bg-muted px-5 py-3 text-sm font-medium text-foreground shadow-none transition  ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
                        <input
                          type="file"
                          accept=".dmg,application/x-apple-diskimage,application/octet-stream"
                          className="sr-only"
                          disabled={uploading||dirty}
                          onChange={uploadRelease}
                        />
                        {uploading ? `正在上传 ${uploadProgress}%` : '上传 PromptDock DMG'}
                      </label>
                      <span className="text-xs font-medium text-muted-foreground">
                        仅站长可上传，最大 512 MB。请先保存设置；上传成功后自动更新下载地址。
                      </span>
                    </div>
                    {uploading && (
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full bg-muted transition-[width]" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs font-medium text-muted-foreground">只有站长账号可以上传安装包。</p>
                )}
              </div>
            </div>
          </div>

          <MailChannelSettings channels={mail.channels} defaultSender={mail.smtp_from||mail.smtp_user} canTest={!dirty&&!!saved} testing={testing} onTest={key=>void testMail(key)} onChange={(key,field,value)=>setMail(prev=>({...prev,channels:{...prev.channels,[key]:{...prev.channels[key],[field]:value,...(field==='address'?{password:'',has_password:false}:{})}}}))}/>
          <p role="status">{dirty?'有尚未保存的修改，请先保存，再测试当前配置。':'配置已保存，可以发送测试邮件验证。'}</p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="workflow-button workflow-primary"
            >
              {saving ? '保存中...' : '保存邮件设置'}
            </button>


          </div>
        </fieldset>
      </div>
    </div>
  );
}
