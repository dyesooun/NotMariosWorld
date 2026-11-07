const finite = value => typeof value === 'number' && Number.isFinite(value);
const EPS = 1e-9;

export function frameClipPolygonError(points) {
  if (!Array.isArray(points)) return 'clipPolygon must be an array';
  if (points.length < 3 || points.length > 128) return 'clipPolygon must contain 3–128 points';
  if (points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(finite) || p.some(v => v < 0 || v > 1))) return 'clipPolygon points must be finite [x,y] pairs in [0,1]';
  const area = points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  if (Math.abs(area) <= EPS) return 'clipPolygon must have nonzero area';
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) if (Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]) <= EPS) return 'clipPolygon points must be distinct';
  const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const on = (a, b, p) => Math.abs(orient(a, b, p)) <= EPS && p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS && p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS;
  const proper = (a, b, c, d) => { const ab1 = orient(a, b, c), ab2 = orient(a, b, d), cd1 = orient(c, d, a), cd2 = orient(c, d, b); return ((ab1 > EPS && ab2 < -EPS) || (ab1 < -EPS && ab2 > EPS)) && ((cd1 > EPS && cd2 < -EPS) || (cd1 < -EPS && cd2 > EPS)); };
  for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= EPS) return 'clipPolygon cannot contain zero-length edges'; for (let j = i + 1; j < points.length; j++) { const c = points[j], d = points[(j + 1) % points.length]; if (j === i || j === (i + 1) % points.length || (i === 0 && j === points.length - 1)) continue; if (proper(a, b, c, d) || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b)) return 'clipPolygon edges must not cross, touch, or overlap'; } }
  return null;
}
export function validateFrameClipPolygon(points) { return !points || frameClipPolygonError(points) === null; }
export function clipPath(ctx, frame, points) { const p = points || [[0, 0], [1, 0], [1, 1], [0, 1]]; ctx.beginPath(); p.forEach(([x, y], i) => i ? ctx.lineTo(x * frame.w, y * frame.h) : ctx.moveTo(x * frame.w, y * frame.h)); ctx.closePath(); }
export function nearestFrameOutlineEdge(points, point, scale = [1, 1]) {
  const outline=points||[[0,0],[1,0],[1,1],[0,1]],px=point[0]*scale[0],py=point[1]*scale[1];let best=null;
  for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length],ax=a[0]*scale[0],ay=a[1]*scale[1],dx=(b[0]-a[0])*scale[0],dy=(b[1]-a[1])*scale[1];
    const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy||1))),x=ax+dx*t,y=ay+dy*t,distance=Math.hypot(px-x,py-y);
    if(!best||distance<best.distance)best={index:i+1,point:[x/scale[0],y/scale[1]],distance};
  }
  return best;
}
export function projectPointToFrameEdge(point) { return nearestFrameOutlineEdge(null, point).point; }
export function insertFrameOutlinePoint(points, point, threshold = 0.08) {
  const result=points?.map(p=>[...p])||[[0,0],[1,0],[1,1],[0,1]],edge=nearestFrameOutlineEdge(result,point);
  if(!edge||edge.distance>threshold)return null;
  result.splice(edge.index,0,edge.point);return result;
}
const maskCache = new WeakMap();
export function maskedFrameSource(image, frame, points) { if (!image || !frame || !points) return null; let map = maskCache.get(image); if (!map) { map = new Map(); maskCache.set(image, map); } const key = `${frame.x},${frame.y},${frame.w},${frame.h}:${JSON.stringify(points)}`; if (map.has(key)) return map.get(key); const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(frame.w, frame.h) : globalThis.document?.createElement('canvas'); if (!canvas) return null; canvas.width = frame.w; canvas.height = frame.h; const c = canvas.getContext('2d'); if (!c) return null; c.imageSmoothingEnabled = false; clipPath(c, frame, points); c.clip(); c.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h); if (map.size >= 128) map.delete(map.keys().next().value); map.set(key, canvas); return canvas; }
