export const BRAND_NAME = 'mooncci';
export function brandText(value: string = '') {
  return value.replace(/\bmooncci\b/gi, BRAND_NAME);
}
