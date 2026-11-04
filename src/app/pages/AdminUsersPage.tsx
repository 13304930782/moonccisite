import { useI18n } from '../i18n';
import { AdminEmpty, AdminError, AdminLoading } from '../components/admin/AdminState';
import { useContentListQuery } from '../lib/useContentListQuery';
import { useEffect, useState } from 'react';

import {Link} from '../components/LocaleLink';
import { useAdminList } from '../lib/useAdminList';
import { AdminPagination } from '../components/AdminPagination';
import { ThemeSelect } from '../components/ThemeSelect';
const roles: Record<string,string> = {owner:'站长',admin:'管理员',editor:'编辑',teacher:'教师',user:'普通用户'};
export default function AdminUsersPage() {
  const { t } = useI18n();
  const query = useContentListQuery();
  const filters = {
    keyword: query.params.get('keyword') || '',
    role: Object.hasOwn(roles, query.params.get('role') || '') ? query.params.get('role')! : 'all',
    status: ['active','disabled'].includes(query.params.get('status') || '') ? query.params.get('status')! : 'all',
  };
  const [keyword,setKeyword] = useState(filters.keyword);
  useEffect(() => { setKeyword(filters.keyword); }, [filters.keyword]);
  const list = useAdminList<any>('/admin/users',filters,query);
  const filter = (patch: Partial<typeof filters>) => { query.update({ ...filters, ...patch, page: '' }); };
  return <div className="admin-page">
    <h1 className="admin-title">{t("m_fbf413d429")}</h1>
    <p className="text-muted-foreground">{t("m_ea29724ddc")}</p>
    <div className="admin-toolbar">
      <form className="admin-search" onSubmit={e=>{e.preventDefault();filter({keyword:keyword.trim()});}}>
        <input aria-label={t("m_62eb3f931b")} placeholder={t("m_5645a9f777")} value={keyword} onChange={e=>setKeyword(e.target.value)} />
        <button className="neo-button" type="submit">{t("m_44ce7ae909")}</button>
      </form>
      <ThemeSelect aria-label={t("m_559df1e120")} value={filters.role} onValueChange={role=>filter({role})}>
        <option value="all">{t("m_2878fe5864")}</option>{Object.entries(roles).map(([v,n])=><option key={v} value={v}>{t(n)}</option>)}
      </ThemeSelect>
      <ThemeSelect aria-label={t("m_444862e025")} value={filters.status} onValueChange={status=>filter({status})}>
        <option value="all">{t("m_0a379c1e73")}</option><option value="active">{t("m_296de0e31f")}</option><option value="disabled">{t("m_608319c0fa")}</option>
      </ThemeSelect>
    </div>
    <AdminPagination label={t("m_df4404553d")} page={list.page} total={list.total} disabled={list.loading} onPage={list.setPage}/>
    {list.error && <AdminError message={list.error} onRetry={list.reload} />}
    {list.loading && <AdminLoading label={t("m_320c1248c3")} />}
    <div>{list.items.map(user=><article className="admin-user-row" key={user.id}>
      <div className="admin-user-info"><strong>{user.username}</strong>{user.deleted_at && <small className="deleted-account-label">{t("m_077a6d3771")}</small>}
        <p>{user.deleted_at ? t("m_27d778daa8") : user.email}</p>
        <p>#{user.id} · {t(roles[user.role] || user.role)} · {user.deleted_at ? t("m_077a6d3771") : user.status==='active'?t("m_296de0e31f"):t("m_a8c3698b5b")}  {t("m_c79f5f413a")}{user.can_comment?t("m_ce7ef28b67"):t("m_b645c326ce")}</p>
      </div>
      <Link className="neo-button" to={`/admin/users/${user.id}/settings`}>{user.deleted_at?t("m_db8db05304"):t("m_df3d58c7d8")}</Link>
    </article>)}</div>
    {!list.loading && !list.error && !list.items.length && <AdminEmpty title={t("m_7950f8e07c")} action={<button className="quiet-button" onClick={()=>{setKeyword('');filter({keyword:'',role:'all',status:'all'});}}>{t("m_ca9d014440")}</button>} />}
  </div>;
}
