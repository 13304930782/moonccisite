import { useI18n } from '../i18n';
import {MailChannelSettings,defaultMailProfiles} from '../components/MailChannelSettings';
import { notify } from '../lib/feedback';
import { ThemeSelect } from '../components/ThemeSelect';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useUnsavedLeave } from '../lib/useUnsavedLeave';

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

export default function AdminMailSettingsPage() {
  const { t } = useI18n();
  const [mail, setMail] = useState(defaultMail);
  const [saved,setSaved] = useState('');
  const [loadAttempt,setLoadAttempt] = useState(0);
  const [loadError,setLoadError] = useState('');
  const dirty = saved !== JSON.stringify(mail);
  // Leaving with edited, unsaved mail settings should ask first (not while still loading).
  useUnsavedLeave(Boolean(saved) && dirty);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setLoadError('');
    api('/settings/mail')
      .then((data) => {const value={...defaultMail,...data};setMail(value);setSaved(JSON.stringify(value));})
      .catch((err) => setLoadError(err.message || t("m_a413bd3617")));
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

      notify.success(res.message || t("m_e05ddf992c"));

      if (res.mail) {
        setMail({ ...defaultMail, ...res.mail });
        setSaved(JSON.stringify({...defaultMail,...res.mail}));
      }
    } catch (err: any) {
      setMessage(err.message || t("m_6309a3bb5b")); notify.error(err.message || t("m_6309a3bb5b"));
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

      notify.success(res.message || t("m_cfb7989b7a"));
    } catch (err: any) {
      setMessage(err.message || t("m_b37d713dcc")); notify.error(err.message || t("m_b37d713dcc"));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="admin-page workflow-feedback">
      <div className="py-2">
        <div className="mb-8">
          <h1 className="admin-title">{t("m_db4b458abf")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
             {t("m_d5f6de2b0d")} </p>
        </div>

        {message && (
          <div role="alert" className="mb-5 rounded-[10px] bg-muted px-4 py-3 text-sm text-foreground">
            {t(message || '')}
          </div>
        )}

        {loadError&&<p role="alert">{t(loadError || '')}<button className="text-link" onClick={()=>setLoadAttempt(n=>n+1)}>{t("m_30de7fb357")}</button></p>}
        {!saved&&!loadError&&<p role="status">{t("m_2f9fc944ad")}</p>}
        <fieldset disabled={!saved||saving||testing} className="space-y-6">
          <div className="admin-settings-section">
            <h2 className="text-xl font-medium text-foreground">{t("m_d3573ff6ef")}</h2>

            <div className="mt-5">
              <label className="block mb-2 text-sm font-medium text-foreground">{t("m_682632a212")}</label>
              <ThemeSelect aria-label={t("m_b8c3d9bf8d")}
                value={mail.enabled}
                onValueChange={(nextValue) => update('enabled', nextValue)}

              >
                <option value="true">{t("m_f4f0ead111")}</option>
                <option value="false">{t("m_3fd47edce4")}</option>
              </ThemeSelect>
            </div>
          </div>

          <div className="admin-settings-section">
            <h2 className="text-xl font-medium text-foreground">{t("m_60f3311b6a")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
               {t("m_b0a7662f54")} </p>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="mail-setting-smtp_host" className="block mb-2 text-sm font-medium text-foreground">{t("m_6a85554c14")}</label>
                <input
                  id="mail-setting-smtp_host"
                  value={mail.smtp_host}
                  onChange={(e) => update('smtp_host', e.target.value)}
                  className="w-full rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                  placeholder={t("m_bd6c5abd4f")}
                />
              </div>

              <div>
                <label htmlFor="mail-setting-smtp_port" className="block mb-2 text-sm font-medium text-foreground">{t("m_cc11599904")}</label>
                <input
                  id="mail-setting-smtp_port"
                  value={mail.smtp_port}
                  onChange={(e) => update('smtp_port', e.target.value)}
                  className="w-full rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                  placeholder="465"
                />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-foreground">{t("m_475ebf9f8b")}</label>
                <ThemeSelect aria-label={t("m_475ebf9f8b")}
                  value={mail.smtp_secure}
                  onValueChange={(nextValue) => update('smtp_secure', nextValue)}

                >
                  <option value="true">{t("m_bb81127579")}</option>
                  <option value="false">{t("m_ee93387aed")}</option>
                </ThemeSelect>
              </div>

              <div>
                <label htmlFor="mail-setting-smtp_user" className="block mb-2 text-sm font-medium text-foreground">{t("m_d85be811a2")}</label>
                <input
                  id="mail-setting-smtp_user"
                  value={mail.smtp_user}
                  onChange={(e) => update('smtp_user', e.target.value)}
                  className="w-full rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                  placeholder="websiteaccount@mooncci.site"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="mail-setting-smtp_pass" className="block mb-2 text-sm font-medium text-foreground">{t("m_4fd5de4163")}</label>
                <input
                  id="mail-setting-smtp_pass"
                  value={mail.smtp_pass}
                  onChange={(e) => update('smtp_pass', e.target.value)}
                  type="password"
                  className="w-full rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                  placeholder={mail.has_smtp_pass ? t("m_ed1ca512ad") : t("m_9e3047be02")}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                   {t("m_5bb03bae35")} </p>
              </div>
            </div>
          </div>

          <div className="admin-settings-section">
            <h2 className="text-xl font-medium text-foreground">{t("m_ece4e4830c")}</h2>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="mail-setting-smtp_from" className="block mb-2 text-sm font-medium text-foreground">{t("m_e8b1db1473")}</label>
                <input
                  id="mail-setting-smtp_from"
                  value={mail.smtp_from}
                  onChange={(e) => update('smtp_from', e.target.value)}
                  className="w-full rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                  placeholder="mooncci <websiteaccount@mooncci.site>"
                />
              </div>

              <div>
                <label htmlFor="mail-setting-notify_to" className="block mb-2 text-sm font-medium text-foreground">{t("m_ac3c2c5bf4")}</label>
                <input
                  id="mail-setting-notify_to"
                  value={mail.notify_to}
                  onChange={(e) => update('notify_to', e.target.value)}
                  className="w-full rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                  placeholder={t("m_a7acdec706")}
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="mail-setting-site_url" className="block mb-2 text-sm font-medium text-foreground">{t("m_5ed42fbc8d")}</label>
                <input
                  id="mail-setting-site_url"
                  value={mail.site_url}
                  onChange={(e) => update('site_url', e.target.value)}
                  className="w-full rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                  placeholder="https://mooncci.site"
                />
              </div>

            </div>
          </div>

          <MailChannelSettings channels={mail.channels} defaultSender={mail.smtp_from||mail.smtp_user} canTest={!dirty&&!!saved} testing={testing} onTest={key=>void testMail(key)} onChange={(key,field,value)=>setMail(prev=>({...prev,channels:{...prev.channels,[key]:{...prev.channels[key],[field]:value,...(field==='address'?{password:'',has_password:false}:{})}}}))}/>
          <p role="status">{dirty?t("m_3ce7622817"):t("m_778f233227")}</p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="workflow-button workflow-primary"
            >
              {saving ? t("m_917b1c1f18") : t("m_bfcb5c4c7b")}
            </button><button type="button" className="workflow-button" disabled={!dirty} onClick={() => { setMail(JSON.parse(saved)); setMessage(''); }}>{t("m_ef804eda90")}</button>


          </div>
        </fieldset>
      </div>
    </div>
  );
}
