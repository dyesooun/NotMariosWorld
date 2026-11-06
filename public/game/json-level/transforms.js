const radians = degrees => (degrees || 0) * Math.PI / 180;
export function placementMatrix(state) {
  const angle = radians(state.rotation), cos = Math.cos(angle), sin = Math.sin(angle), flip = state.flipX ? -1 : 1;
  const a = cos * flip, b = sin * flip, c = -sin, d = cos;
  return { a, b, c, d, e: state.x + state.width / 2 - a * state.width / 2 - c * state.height / 2, f: state.y + state.height / 2 - b * state.width / 2 - d * state.height / 2 };
}
export function localToWorld(state, point) {
  const m = placementMatrix(state);
  return { x: m.a * point.x + m.c * point.y + m.e, y: m.b * point.x + m.d * point.y + m.f };
}
export function worldToLocal(state, point) {
  const m = placementMatrix(state), det = m.a * m.d - m.b * m.c;
  const x = point.x - m.e, y = point.y - m.f;
  return { x: (m.d * x - m.c * y) / det, y: (-m.b * x + m.a * y) / det };
}
export function placementCorners(state) {
  return [[0,0],[state.width,0],[state.width,state.height],[0,state.height]].map(([x,y]) => localToWorld({ ...state, flipX: false }, { x,y }));
}
export function placementBounds(state) {
  const corners = placementCorners(state), xs = corners.map(p => p.x), ys = corners.map(p => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}
export function containsPlacement(state, point) {
  const local = worldToLocal(state, point);
  return local.x >= 0 && local.y >= 0 && local.x <= state.width && local.y <= state.height;
}
const positions = { nw:[0,0], n:[.5,0], ne:[1,0], e:[1,.5], se:[1,1], s:[.5,1], sw:[0,1], w:[0,.5] };
export function getTransformHandles(state, view) {
  const plain = { ...state, flipX: false };
  const handles = Object.entries(positions).map(([id, [x,y]]) => ({ id, type:'resize', ...localToWorld(plain, { x:x*state.width,y:y*state.height }) }));
  handles.push({ id:'move', type:'move', ...localToWorld(plain, {x:state.width/2,y:state.height/2}) });
  handles.push({ id:'rotate', type:'rotate', ...localToWorld(plain, {x:state.width/2,y:-28/view.zoom}) });
  return handles.map(h => ({ ...h, screenX:(h.x-view.x)*view.zoom, screenY:(h.y-view.y)*view.zoom }));
}
export function hitTestHandles(handles, point, radius = 8) {
  return [...handles].reverse().find(h => Math.hypot(h.screenX-point.x,h.screenY-point.y) <= radius) || null;
}
export function resizePlacement(state, handleId, pointer, { minSize = 1, lockAspect = false } = {}) {
  const position = positions[handleId];
  if (!position) throw new Error('Unknown resize handle.');
  const sx = Math.sign(position[0]-.5), sy = Math.sign(position[1]-.5), angle = radians(state.rotation);
  const u = {x:Math.cos(angle),y:Math.sin(angle)}, v = {x:-Math.sin(angle),y:Math.cos(angle)};
  const anchor = localToWorld({...state,flipX:false},{x:(sx<0?1:sx>0?0:.5)*state.width,y:(sy<0?1:sy>0?0:.5)*state.height});
  const dx = pointer.x-anchor.x, dy = pointer.y-anchor.y;
  let width = sx ? Math.max(minSize,sx*(dx*u.x+dy*u.y)) : state.width;
  let height = sy ? Math.max(minSize,sy*(dx*v.x+dy*v.y)) : state.height;
  if (lockAspect && sx && sy) { const ratio = Math.max(width/state.width,height/state.height); width=state.width*ratio; height=state.height*ratio; }
  const cx = anchor.x + sx*width/2*u.x + sy*height/2*v.x, cy = anchor.y + sx*width/2*u.y + sy*height/2*v.y;
  return { x:cx-width/2,y:cy-height/2,width,height,rotation:state.rotation||0 };
}
export function rotationForPointer(state, pointer, snapDegrees = 0) {
  let angle = Math.atan2(pointer.y-(state.y+state.height/2),pointer.x-(state.x+state.width/2))*180/Math.PI+90;
  if (snapDegrees) angle = Math.round(angle/snapDegrees)*snapDegrees;
  return ((angle+180)%360+360)%360-180;
}
