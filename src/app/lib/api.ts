import { clearPublicSnapshots } from './publicSnapshots';
import { beginApiDiagnostic } from './browserDiagnostics';
export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'cancelled' | 'format';
export class ApiError extends Error {
  constructor(message: string, public status: number, public kind: ApiErrorKind = 'http', public uncertain = false, public code?: string) {
    super(message); this.name = 'ApiError';
  }
}
// Some privacy-preserving queries use POST without changing stored data.
export type ApiOptions = RequestInit & { timeoutMs?: number; readOnly?: boolean };
export async function api(path: string, options: ApiOptions = {}) {
  const { timeoutMs, readOnly = false, signal: callerSignal, ...request } = options;
  const writing = !readOnly && !['GET', 'HEAD'].includes((request.method || 'GET').toUpperCase());
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) cancel(); else callerSignal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs ?? (writing ? 60000 : 20000));
  const headers = new Headers(request.headers);
  headers.set('X-Requested-With', 'XMLHttpRequest');
  if (!(request.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  headers.delete('Authorization');
  const diagnostic = beginApiDiagnostic(path);
  if (diagnostic) headers.set('X-Mooncci-Diagnostic', '1');
  const uncertainMessage = '尚未确认操作结果，请先刷新或查看记录，确认后再重试。';
  try {
    if (callerSignal?.aborted) throw new ApiError('请求已取消。', 0, 'cancelled');
    const res = await fetch(`/api${path}`, { ...request, credentials: 'same-origin', headers, signal: controller.signal });
    diagnostic?.response(res);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      await res.body?.cancel();
      throw new ApiError(writing ? uncertainMessage : '暂时无法加载，请稍后重试。', res.status, 'format', writing);
    }
    let data: any;
    try { data = await res.json(); } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new ApiError(writing ? uncertainMessage : '内容暂时无法读取，请重试。', res.status, 'format', writing);
    }
    if (!res.ok) {
      const uncertain = writing && res.status >= 500;
      // These routes deliberately return safe provider errors, not exception text.
      const cityMessage = readOnly && /^\/weather-mood\/(cities|locate|locate-network)$/.test(path) && typeof data?.code === 'string' && /^(AMAP_|CITY_|WEATHER_UPSTREAM_LIMIT)/.test(data.code) && typeof data?.message === 'string' ? data.message : '';
      const message = uncertain ? uncertainMessage : cityMessage || (res.status >= 500 ? '服务暂时不可用，请稍后重试。' : data?.message || (res.status === 401 ? '登录已过期，请重新登录后继续。' : res.status === 403 ? '当前账号没有此操作权限。' : '操作未完成，请检查后重试。'));
      throw new ApiError(message, res.status, 'http', uncertain, cityMessage ? data.code : undefined);
    }
    if (writing && /^\/(?:admin\/posts|article-drafts|publishing)(?:\/|$)/.test(path)) clearPublicSnapshots();
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const kind = callerSignal?.aborted ? 'cancelled' : timedOut ? 'timeout' : 'network';
    throw new ApiError(writing ? uncertainMessage : kind === 'cancelled' ? '请求已取消。' : kind === 'timeout' ? '加载时间较长，请检查网络后重试。' : '网络连接中断，请检查网络后重试。', 0, kind, writing);
  } finally { diagnostic?.finish(); clearTimeout(timer); callerSignal?.removeEventListener('abort', cancel); }
}
