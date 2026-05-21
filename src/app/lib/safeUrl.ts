const SAFE_HREF_PROTOCOLS = ['http:', 'https:', 'mailto:'];
const SAFE_IMAGE_PROTOCOLS = ['http:', 'https:'];

function cleanUrl(input: unknown) {
  const value = String(input || '').trim();

  if (!value || /[\u0000-\u001f\u007f\\]/.test(value)) {
    return '';
  }

  return value;
}

function isRelativeUrl(value: string) {
  if (value.startsWith('//')) {
    return false;
  }

  return (
    value.startsWith('/') ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    value.startsWith('#')
  );
}

function safeUrl(input: unknown, allowedProtocols: string[], fallback = '') {
  const value = cleanUrl(input);

  if (!value) return fallback;

  if (isRelativeUrl(value)) {
    return value;
  }

  try {
    const parsed = new URL(value);
    return allowedProtocols.includes(parsed.protocol) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function safeHref(input: unknown, fallback = '') {
  return safeUrl(input, SAFE_HREF_PROTOCOLS, fallback);
}

export function safeImageSrc(input: unknown, fallback = '') {
  return safeUrl(input, SAFE_IMAGE_PROTOCOLS, fallback);
}

export function safeRoutePath(input: unknown, fallback = '/') {
  const value = cleanUrl(input);

  if (!value) return fallback;

  return isRelativeUrl(value) ? value : fallback;
}

export function isExternalHttpUrl(input: unknown) {
  const value = cleanUrl(input);

  if (!value) return false;

  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function safeMailto(email: unknown) {
  const value = cleanUrl(email);

  if (!value || /[\s?/#:]/.test(value)) {
    return '';
  }

  return `mailto:${encodeURIComponent(value)}`;
}
