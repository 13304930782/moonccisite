type Point = [number, number, number];
type Face = { p: Point[]; c: string };
const faces: Face[] = [];
const ring = (y: number, r: number, x = 0): Point[] => Array.from({ length: 20 }, (_, i) => {
  const a = i * Math.PI / 10;
  return [x + r * Math.cos(a), y, r * Math.sin(a)];
});
const join = (a: Point[], b: Point[], c: string) => a.forEach((p, i) => {
  const j = (i + 1) % a.length;
  faces.push({ p: [p, a[j], b[j], b[i]], c });
});
const rim = ring(12, 112).map(([x, y, z], i): Point => [x, y - 7 * Math.cos(i * Math.PI / 5) + 2 * Math.sin(i * Math.PI / 10), z]), base = ring(8, 63);
join(rim, base, 'purple');
join(rim.map(([x, y, z]): Point => [x, y + 2.5, z]), rim, 'dark');
const band = ring(-18, 53, -3);
join(base, band, 'orange');
const middle = ring(-80, 29, -10), tip = ring(-130, 11);
join(band, middle, 'purple');
join(middle, tip, 'purple');
join(tip, ring(-141, 0, 31), 'purple');
const buckle = (x: number, y: number, z: number, c: string) => faces.push({ p: [[-x, y, z], [x, y, z], [x, 5, z + 6], [-x, 5, z + 6]], c });
buckle(14, -20, 55, 'gold');
buckle(9, -15, 57, 'dark');

// All surfaces use the same camera; split crossing faces at the head's depth plane.
export function hatGeometry(pitch: number, yaw: number) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const output: { d: string; c: string; z: number; r: boolean }[] = [];
  faces.forEach(({ p: points, c: color }, index) => {
    const projected: Point[] = points.map(([x, y, z]) => {
      z += Math.min(0, y - 8) * .2;
      y += 12;
      const depth = z * cy - x * sy;
      return [114 + x * cy + z * sy, 114 + (y - 114) * cp + depth * sp, depth * cp - (y - 114) * sp];
    });
    const area = projected.reduce((n, p, i) => {
      const q = projected[(i + 1) % projected.length];
      return n + p[0] * q[1] - q[0] * p[1];
    }, 0);
    if (index >= 40 && area <= 0) return;
    for (const rear of [true, false]) {
      const clipped: Point[] = [];
      projected.forEach((a, i) => {
        const b = projected[(i + 1) % projected.length], inside = rear ? a[2] <= 0 : a[2] >= 0;
        if (inside) clipped.push(a);
        if (a[2] * b[2] < 0) {
          const t = a[2] / (a[2] - b[2]);
          clipped.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), 0]);
        }
      });
      if (clipped.length > 2) output.push({ d: 'M' + clipped.map(([x, y]) => x.toFixed(2) + ' ' + y.toFixed(2)).join('L') + 'Z', c: color, r: rear, z: clipped.reduce((n, p) => n + p[2], 0) / clipped.length });
    }
  });
  return output.sort((a, b) => a.z - b.z);
}
