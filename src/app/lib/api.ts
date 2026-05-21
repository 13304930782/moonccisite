export async function api(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  headers['X-Requested-With'] = headers['X-Requested-With'] || 'XMLHttpRequest';

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  delete headers.Authorization;
  delete headers.authorization;

  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  let data: any = null;

  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    data = {
      message: text.includes('<!DOCTYPE')
        ? '接口返回了网页内容，请检查后端或 Nginx 的 /api 代理'
        : text || '请求失败',
    };
  }

  if (!res.ok) {
    throw new Error(data?.message || '请求失败');
  }

  return data;
}
