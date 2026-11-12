import { useI18n } from '../i18n';
import { notify } from '../lib/feedback';
import { FormEvent, useEffect, useState } from 'react';

import {Link} from '../components/LocaleLink';
import { PenLine, Send, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const roleLabel: Record<string, string> = {
  owner: '站长',
  admin: '管理员',
  editor: '编辑',
  user: '普通用户',
};

function canWrite(role?: string) {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

function getRoleTip(role?: string) {
  if (role === 'owner') return '你当前是站长账号，已经拥有最高权限，不需要申请成为编辑。';
  if (role === 'admin')
    return '你当前是管理员账号，已经可以写文章和管理内容，不需要申请成为编辑。';
  if (role === 'editor') return '你当前已经是编辑账号，可以直接写文章。';
  return '投稿不需要编辑权限；如需参与后台内容维护，再提交编辑申请。';
}

function getRoleName(role?: string) {
  if (role === 'owner') return '站长';
  if (role === 'admin') return '管理员';
  if (role === 'editor') return '编辑';
  return '普通用户';
}

export default function EditorApplyPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMessage('');
  }, [user?.role]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!user) {
      setMessage(t("m_b54de79265"));
      return;
    }

    if (canWrite(user.role)) {
      setMessage(t("m_f9a5222d13"));
      return;
    }

    if (!reason.trim()) {
      setMessage(t("m_a3623909ea"));
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const res = await api('/applications', {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });

      notify.success(res.message || t("m_5a4423372d"));
      setReason('');
    } catch (err: any) {
      setMessage(err.message || t("m_2084657131"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="max-w-2xl">
      <div className="admin-overview-head">
        <p className="eyebrow">{t("m_9cf0c16d11")}</p>
        <h1>{t("m_6ef4c0ce0a")}</h1>
        <p>{t(getRoleTip(user?.role))}</p>
      </div>
      <p className="muted text-sm">
         {t("m_e697637f6c")}{user?.username} · {t(getRoleName(user?.role))}
      </p>
      {message && (
        <p className="form-message" role="status">
          {t(message || '')}
        </p>
      )}
      {!canWrite(user?.role) && <Link className="quiet-button mt-6" to="/account/submissions">{t("m_77de6910c7")}</Link>}
      {!canWrite(user?.role) && (
        <form onSubmit={submit} className="site-form mt-8">
          <label htmlFor="editor-reason">{t("m_c033e6eeed")}</label>
          <textarea
            id="editor-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={6}
            className="w-full mt-3"
            placeholder={t("m_6c840684a2")}
          />
          <button className="quiet-button mt-6" disabled={loading || !user}>
            {loading ? t("m_18931020ad") : t("m_9cc5e4d81e")}
          </button>
        </form>
      )}
    </section>
  );
}
