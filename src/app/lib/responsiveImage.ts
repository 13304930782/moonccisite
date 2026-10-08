export function responsiveImage(src: string, avatar = false) {
  const match = /^\/api\/uploads\/([\w.-]+\.(?:png|jpe?g|webp))$/i.exec(src);
  if (!match) return { src };
  const widths = avatar ? [48, 96, 144] : [180, 360, 540];
  const url = (width: number) => `/api/image-variants/${width}/${match[1]}`;
  return { src: url(widths[0]), srcSet: widths.map(width => `${url(width)} ${width}w`).join(', '), sizes: avatar ? '26px' : '(max-width: 760px) 88px, 180px' };
}
