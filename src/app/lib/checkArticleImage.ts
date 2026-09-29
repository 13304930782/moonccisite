export type ImageCheckResult = 'loaded' | 'failed' | 'timeout';

export function checkArticleImage(url: string, rendered: HTMLImageElement[], timeoutMs = 20000): Promise<ImageCheckResult> {
  if (rendered.some(image => image.src === url && image.complete && image.naturalWidth > 0)) return Promise.resolve('loaded');
  return new Promise(resolve => {
    const image = new Image();
    let settled = false;
    const finish = (result: ImageCheckResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (result === 'timeout') image.removeAttribute('src');
      resolve(result);
    };
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    image.onload = () => finish(image.naturalWidth > 0 ? 'loaded' : 'failed');
    image.onerror = () => finish('failed');
    image.src = url;
  });
}
