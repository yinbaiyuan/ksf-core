// Local, deliberately conservative separation. This is not semantic segmentation.
export const MAX_PIXELS = 4 * 1024 * 1024;
const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
const hex = rgb => '#' + rgb.map(v => clamp(v).toString(16).padStart(2, '0')).join('');
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
function solve(rows, channel) {
  const a = Array.from({length: 3}, () => [0, 0, 0, 0]);
  for (const {x, y, rgb} of rows) {
    const p = [1, x, y];
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) a[i][j] += p[i] * p[j]; a[i][3] += p[i] * rgb[channel]; }
  }
  for (let i = 0; i < 3; i++) {
    const pivot = a.reduce((best, row, j) => j >= i && Math.abs(row[i]) > Math.abs(a[best][i]) ? j : best, i);
    [a[i], a[pivot]] = [a[pivot], a[i]];
    if (Math.abs(a[i][i]) < 1e-8) return null;
    const scale = a[i][i]; for (let j = i; j < 4; j++) a[i][j] /= scale;
    for (let k = 0; k < 3; k++) if (k !== i) { const n = a[k][i]; for (let j = i; j < 4; j++) a[k][j] -= n * a[i][j]; }
  }
  return a.map(r => r[3]);
}
function backgroundFit(image, tolerance) {
  const {width: w, height: h, data} = image, rows = [];
  const at = (x, y) => { const i = (y * w + x) * 4; if (data[i + 3] > 248) rows.push({x: x / (w - 1), y: y / (h - 1), rgb: Array.from(data.subarray(i, i + 3))}); };
  // Sample two rings, avoiding rounded transparent corners and antialiasing.
  for (const inset of [Math.max(1, Math.floor(Math.min(w, h) * .02)), Math.max(2, Math.floor(Math.min(w, h) * .06))]) {
    for (let n = 0; n < 64; n++) { const t = .12 + .76 * n / 63; at(Math.round(t * (w - 1)), inset); at(Math.round(t * (w - 1)), h - 1 - inset); at(inset, Math.round(t * (h - 1))); at(w - 1 - inset, Math.round(t * (h - 1))); }
  }
  if (rows.length < 100) return null;
  let kept = rows, fit;
  const color = (x, y) => fit.map(c => c[0] + c[1] * x + c[2] * y);
  for (let step = 0; step < 3; step++) {
    fit = [0, 1, 2].map(c => solve(kept, c)); if (fit.some(c => !c)) return null;
    kept = rows.filter(r => distance(r.rgb, color(r.x, r.y)) <= tolerance);
    if (kept.length < rows.length * .92) return null;
  }
  if (Math.sqrt(kept.reduce((n, r) => n + distance(r.rgb, color(r.x, r.y)) ** 2, 0) / kept.length) > tolerance * .6) return null;
  // Only a single RGB direction is a simple two-colour linear gradient.
  const vx = fit.map(c => c[1]), vy = fit.map(c => c[2]);
  if (Math.hypot(...vx) > 15 && Math.hypot(...vy) > 15 && Math.abs(vx.reduce((n, v, i) => n + v * vy[i], 0) / Math.hypot(...vx) / Math.hypot(...vy)) < .98) return null;
  const corners = [[0, 0], [1, 0], [0, 1], [1, 1]];
  let ends = [corners[0], corners[3]], longest = 0;
  for (const a of corners) for (const b of corners) { const d = distance(color(...a), color(...b)); if (d > longest) { longest = d; ends = [a, b]; } }
  const dx = ends[1][0] - ends[0][0], dy = ends[1][1] - ends[0][1];
  return {color, background: {colors: ends.map(p => hex(color(...p))), angle: (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360}};
}
function palette(image) {
  const bins = new Map();
  for (let i = 0; i < image.data.length; i += 4) if (image.data[i + 3] > 180) {
    const rgb = Array.from(image.data.subarray(i, i + 3)), key = rgb.map(v => v >> 5).join(',');
    const old = bins.get(key) ?? {count: 0, rgb: [0, 0, 0]}; old.count++; rgb.forEach((v, c) => old.rgb[c] += v); bins.set(key, old);
  }
  const colors = [...bins.values()].sort((a, b) => b.count - a.count).map(v => v.rgb.map(c => c / v.count));
  const a = colors[0] ?? [70, 110, 160], b = colors.find(c => distance(c, a) > 45) ?? a.map(v => v * .72);
  return {colors: [hex(a), hex(b)], angle: 135};
}
export function separateIcon(image) {
  const {width: w, height: h, data} = image;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 8 || h < 8 || w * h > MAX_PIXELS || data.length !== w * h * 4) return {status: 'fallback', reason: 'dimensions', invalid: true};
  let visible = 0, transparent = 0;
  for (let i = 3; i < data.length; i += 4) { if (data[i] > 8) visible++; if (data[i] < 248) transparent++; }
  if (visible < 8) return {status: 'fallback', reason: 'blank', invalid: true};
  const fit = backgroundFit(image, 7);
  if (!fit) return transparent > w * h * .08 ? {status: 'ready', image, background: palette(image), method: 'alpha'} : {status: 'fallback', reason: 'complex-background'};
  const output = new Uint8Array(data), cutoff = 9;
  let foreground = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, d = distance(Array.from(data.subarray(i, i + 3)), fit.color(x / (w - 1), y / (h - 1)));
    output[i + 3] = d <= cutoff ? 0 : data[i + 3];
    if (output[i + 3] > 8) foreground++;
  }
  const ratio = foreground / (w * h);
  if (ratio < .012 || ratio > .72) return {status: 'fallback', reason: 'uncertain-mask'};
  // Recover coverage and original edge colour against the fitted background.
  // Neighbouring interior pixels supply a colour direction, never a replacement hue.
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = (y * w + x) * 4;
    if (!output[i + 3]) continue;
    const bg = fit.color(x / (w - 1), y / (h - 1)), rgb = Array.from(data.subarray(i, i + 3));
    let candidate, best = 0, edge = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!output[((y + dy) * w + x + dx) * 4 + 3]) edge = true;
    if (!edge) continue;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (y + dy < 0 || y + dy >= h || x + dx < 0 || x + dx >= w) continue;
      const n = ((y + dy) * w + x + dx) * 4, c = Array.from(data.subarray(n, n + 3)), strength = distance(c, bg);
      if (output[n + 3] > 240 && strength > best) { candidate = c; best = strength; }
    }
    if (!candidate || best < 30) continue;
    const v = candidate.map((c, k) => c - bg[k]), alpha = Math.min(1, Math.max(0, rgb.reduce((n, c, k) => n + (c - bg[k]) * v[k], 0) / v.reduce((n, c) => n + c * c, 0)));
    const reconstructed = bg.map((c, k) => c + alpha * v[k]);
    if (alpha > .03 && alpha < .98 && distance(rgb, reconstructed) < 8) {
      output[i + 3] = clamp(data[i + 3] * alpha);
      for (let k = 0; k < 3; k++) output[i + k] = clamp((rgb[k] - bg[k] * (1 - alpha)) / alpha);
    }
  }
  return {status: 'ready', image: {...image, data: output}, background: fit.background, method: 'edge-fit'};
}
/** Fit the original canvas into a fixed square without clipping or recolouring it. */
export function resizeForeground(image, size = 256) {
  const {width: w, height: h, data} = image, output = new Uint8Array(size * size * 4), scale = size / Math.max(w, h);
  const dw = Math.round(w * scale), dh = Math.round(h * scale), ox = Math.floor((size - dw) / 2), oy = Math.floor((size - dh) / 2);
  // Premultiplied bilinear resampling avoids dark halos on transparent edges.
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sx = Math.max(0, Math.min(w - 1, (x + .5) / scale - .5)), sy = Math.max(0, Math.min(h - 1, (y + .5) / scale - .5));
    const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy, sums = [0, 0, 0, 0];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const i = (Math.min(h - 1, iy + dy) * w + Math.min(w - 1, ix + dx)) * 4, weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy), a = data[i + 3] / 255; sums[3] += weight * a; for (let k = 0; k < 3; k++) sums[k] += weight * a * data[i + k]; }
    const out = ((y + oy) * size + x + ox) * 4; for (let k = 0; k < 3; k++) output[out + k] = sums[3] ? clamp(sums[k] / sums[3]) : 0; output[out + 3] = clamp(sums[3] * 255);
  }
  return {width: size, height: size, data: output};
}
