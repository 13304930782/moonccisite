export type ImageDimensions = Record<string, { width: number; height: number }>;

// Deliberately exclude external URLs, even when their path resembles an upload.
export function dimensionsFor(src: string | undefined, dimensions?: ImageDimensions) {
  if (!src || !/^\/api\/uploads\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}(?:[?#]|$)/.test(src)) return {};
  const value = dimensions?.[src.split(/[?#]/, 1)[0]];
  if (!value || !Number.isInteger(value.width) || value.width <= 0 || value.width > 100000 ||
      !Number.isInteger(value.height) || value.height <= 0 || value.height > 100000) return {};
  return { width: value.width, height: value.height };
}
