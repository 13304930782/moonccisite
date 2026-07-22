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
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    api('/settings/mail')
      .then((data) => setMail({ ...defaultMail, ...data }))
      .catch((err) => setMessage(err.message || '邮件设置加载失败'));
  }, []);

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

      setMessage(res.message || '保存成功');

      if (res.mail) {
        setMail({ ...defaultMail, ...res.mail });
      }
    } catch (err: any) {
      setMessage(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const testMail = async () => {
    setTesting(true);
    setMessage('');

    try {
      const res = await api('/settings/mail/test', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      setMessage(res.message || '测试邮件已发送');
    } catch (err: any) {
      setMessage(err.message || '测试邮件发送失败');
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
    <div className="max-w-5xl mx-auto">
      <div className="rounded-[2rem] bg-white/85 backdrop-blur border border-white/50 p-8 shadow-xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">邮件提醒设置</h1>
          <p className="mt-2 text-sm text-gray-500">
            配置评论审核、Early Access 申请提醒与统一品牌邮件。
          </p>
        </div>

        {message && (
          <div className="mb-5 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {message}
          </div>
        )}

        <div className="space-y-6">
          <div className="rounded-3xl border border-gray-200 bg-white/70 p-6">
            <h2 className="text-xl font-semibold text-gray-900">基础开关</h2>

            <div className="mt-5">
              <label className="block mb-2 text-sm font-medium text-gray-700">是否启用邮件提醒</label>
              <select
                value={mail.enabled}
                onChange={(e) => update('enabled', e.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="true">启用</option>
                <option value="false">关闭</option>
              </select>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white/70 p-6">
            <h2 className="text-xl font-semibold text-gray-900">SMTP 配置</h2>
            <p className="mt-1 text-sm text-gray-500">
              Resend 通常填写 smtp.resend.com / 465 / resend / SMTP 密码。
            </p>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">SMTP 服务器</label>
                <input
                  value={mail.smtp_host}
                  onChange={(e) => update('smtp_host', e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="smtp.resend.com"
                />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">SMTP 端口</label>
                <input
                  value={mail.smtp_port}
                  onChange={(e) => update('smtp_port', e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="465"
                />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">是否 SSL</label>
                <select
                  value={mail.smtp_secure}
                  onChange={(e) => update('smtp_secure', e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">SMTP 用户</label>
                <input
                  value={mail.smtp_user}
                  onChange={(e) => update('smtp_user', e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="resend"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block mb-2 text-sm font-medium text-gray-700">SMTP 密码 / 授权码</label>
                <input
                  value={mail.smtp_pass}
                  onChange={(e) => update('smtp_pass', e.target.value)}
                  type="password"
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={mail.has_smtp_pass ? '已保存密码；不修改可留空' : '请输入 SMTP 密码'}
                />
                <p className="mt-2 text-xs text-gray-500">
                  为了安全，后台不会回显已保存的密码。不想修改密码就留空。
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white/70 p-6">
            <h2 className="text-xl font-semibold text-gray-900">发件与收件</h2>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">发件人</label>
                <input
                  value={mail.smtp_from}
                  onChange={(e) => update('smtp_from', e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Mooncci Blog <websiteaccount@mooncci.site>"
                />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">接收提醒邮箱</label>
                <input
                  value={mail.notify_to}
                  onChange={(e) => update('notify_to', e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="a15326192500@gmail.com"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block mb-2 text-sm font-medium text-gray-700">站点地址</label>
                <input
                  value={mail.site_url}
                  onChange={(e) => update('site_url', e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://mooncci.site"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block mb-2 text-sm font-medium text-gray-700">Early Access 下载地址</label>
                <input
                  value={mail.early_access_download_url}
                  onChange={(e) => update('early_access_download_url', e.target.value)}
                  type="url"
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://downloads.example.com/PromptDock.dmg"
                />
                <p className="mt-2 text-xs text-gray-500">
                  必须使用 HTTPS。未配置时，Early Access 申请可以查看和拒绝，但无法批准。
                </p>
                {user?.role === 'owner' ? (
                  <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className={`inline-flex cursor-pointer items-center rounded-2xl bg-[#ffe17c] px-5 py-3 text-sm font-bold text-black shadow-[3px_3px_0_#000] transition hover:-translate-y-0.5 ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
                        <input
                          type="file"
                          accept=".dmg,application/x-apple-diskimage,application/octet-stream"
                          className="sr-only"
                          disabled={uploading}
                          onChange={uploadRelease}
                        />
                        {uploading ? `正在上传 ${uploadProgress}%` : '上传 PromptDock DMG'}
                      </label>
                      <span className="text-xs font-medium text-gray-500">
                        仅站长可上传，最大 512 MB。上传成功后会自动更新上方地址。
                      </span>
                    </div>
                    {uploading && (
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full bg-blue-600 transition-[width]" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs font-medium text-gray-500">只有站长账号可以上传安装包。</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-2xl bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? '保存中...' : '保存邮件设置'}
            </button>

            <button
              onClick={testMail}
              disabled={testing}
              className="rounded-2xl bg-gray-950 px-6 py-3 text-white hover:bg-gray-800 disabled:opacity-60"
            >
              {testing ? '发送中...' : '发送测试邮件'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
