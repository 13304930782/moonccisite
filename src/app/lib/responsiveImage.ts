export function responsiveImage(src: string, avatar = false, zoom = 1) {
  const match = /^\/api\/uploads\/([\w.-]+\.(?:png|jpe?g|webp))$/i.exec(src);
  if (!match) return { src };
  const widths = avatar ? [48, 96, 144] : [180, 360, 540];
  const url = (width: number) => `/api/image-variants/${width}/${match[1]}`;
  const scale = Number.isFinite(zoom) ? Math.min(3, Math.max(1, zoom)) : 1;
  return { src: url(widths[0]), srcSet: widths.map(width => `${url(width)} ${width}w`).join(', '), sizes: avatar ? '26px' : `(max-width: 760px) ${112*scale}px, ${180*scale}px` };
}
