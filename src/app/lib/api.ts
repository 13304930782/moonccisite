export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);

  headers.set('X-Requested-With', 'XMLHttpRequest');

  if (!(options.body instanceof FormData)) {
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  }

  headers.delete('Authorization');

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
    throw new ApiError(
      /<!doctype|<html/i.test(text)
        ? '接口返回了网页内容，请检查后端或 Nginx 的 /api 代理'
        : '接口返回格式异常，请稍后重试',
      res.status,
    );
  }

  if (!res.ok) {
    throw new ApiError(data?.message || '请求失败', res.status);
  }

  return data;
}
