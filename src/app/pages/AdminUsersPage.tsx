import { useI18n } from '../i18n';
import { AdminEmpty, AdminError, AdminLoading } from '../components/admin/AdminState';
import { useContentListQuery } from '../lib/useContentListQuery';
import { useEffect, useState } from 'react';

import {Link} from '../components/LocaleLink';
import { useAdminList } from '../lib/useAdminList';
import { AdminPagination } from '../components/AdminPagination';
import { ThemeSelect } from '../components/ThemeSelect';
import { AdminButton } from '../components/admin/AdminButton';
import '../../styles/admin-list-polish.css';
import '../../styles/admin-ui-v2.css';
import '../../styles/admin-users.css';
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
  const filtered=Boolean(filters.keyword||filters.role!=='all'||filters.status!=='all');
  const reset=()=>{setKeyword('');filter({keyword:'',role:'all',status:'all'});};
  return <div className="admin-page admin-list-page admin-users-page ui-v2">
    <header className="admin-users-heading"><h1 className="admin-title">{t("m_fbf413d429")}</h1>
    <p className="text-muted-foreground">{t("m_ea29724ddc")}</p></header>
    <div className="admin-toolbar">
      <form className="admin-search" onSubmit={e=>{e.preventDefault();filter({keyword:keyword.trim()});}}>
        <input aria-label={t("m_62eb3f931b")} placeholder={t("m_5645a9f777")} value={keyword} onChange={e=>setKeyword(e.target.value)} />
        <AdminButton variant="soft" type="submit">{t("m_44ce7ae909")}</AdminButton>
      </form>
      <label>{t('m_c47b54e84e')}<ThemeSelect compact aria-label={t("m_559df1e120")} value={filters.role} onValueChange={role=>filter({role})}>
        <option value="all">{t("m_2878fe5864")}</option>{Object.entries(roles).map(([v,n])=><option key={v} value={v}>{t(n)}</option>)}
      </ThemeSelect></label>
      <label>{t('m_6320b4a872')}<ThemeSelect compact aria-label={t("m_444862e025")} value={filters.status} onValueChange={status=>filter({status})}>
        <option value="all">{t("m_0a379c1e73")}</option><option value="active">{t("m_296de0e31f")}</option><option value="disabled">{t("m_608319c0fa")}</option>
      </ThemeSelect></label>
    </div>
    <div className="admin-users-results-heading">
    {!list.error && !list.loading && (list.total <= 50 && list.page === 1
      ? <p className="admin-list-count" role="status">{t('共 {count} 项',{count:list.total})}</p>
      : <AdminPagination label={t("m_df4404553d")} page={list.page} total={list.total} disabled={list.loading} onPage={list.setPage}/>)}
    {filtered&&<AdminButton type="button" variant="ghost" onClick={reset}>{t('m_ca9d014440')}</AdminButton>}</div>
    <div className="admin-users-results" aria-busy={list.loading}>
    {list.error && <AdminError message={list.error} onRetry={list.reload} />}
    {list.loading && <AdminLoading label={t("m_320c1248c3")} />}
    {!!list.items.length&&<div className="admin-users-columns" aria-hidden="true"><span>{t('m_1a3f0617d6')}</span><span>{t('m_c47b54e84e')}</span><span>{t('m_6320b4a872')}</span><span/></div>}
    <div>{list.items.map(user=><article className="admin-user-row" key={user.id}>
      <div className="admin-user-info"><div className="admin-user-name"><strong>{user.username}</strong><small>#{user.id}</small></div>
        <p>{user.deleted_at ? t("m_27d778daa8") : user.email}</p>
      </div>
      <span className="admin-user-role">{t(roles[user.role] || user.role)}</span><div className="admin-user-meta"><span className="admin-user-status" data-inactive={!!user.deleted_at||user.status!=='active'}>{user.deleted_at ? t("m_077a6d3771") : user.status==='active'?t("m_296de0e31f"):t("m_a8c3698b5b")}</span><small>{t('评论')} {user.can_comment?t("m_ce7ef28b67"):t("m_b645c326ce")}</small></div>
      <AdminButton asChild variant="soft"><Link aria-label={t('管理用户 {name}',{name:user.username})} to={`/admin/users/${user.id}/settings`}>{user.deleted_at?t("m_db8db05304"):t("m_df3d58c7d8")}</Link></AdminButton>
    </article>)}</div>
    {!list.loading && !list.error && !list.items.length && <AdminEmpty title={t("m_7950f8e07c")} action={filtered?<AdminButton variant="soft" onClick={reset}>{t("m_ca9d014440")}</AdminButton>:undefined} />}
    </div>
  </div>;
}
