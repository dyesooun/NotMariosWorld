import { placementCorners } from './transforms.js';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const point = value => value && finite(value.x) && finite(value.y);

function validateStates(states) {
  if (!Array.isArray(states) || !states.length) throw new Error('A group must contain at least one placement.');
  for (const state of states) {
    if (!state || !['x', 'y', 'width', 'height'].every(key => finite(state[key])) || state.width <= 0 || state.height <= 0) {
      throw new Error('Group placements must have finite positive geometry.');
    }
  }
}

export function getGroupBounds(states) {
  validateStates(states);
  const corners = states.flatMap(state => placementCorners(state));
  const xs = corners.map(corner => corner.x), ys = corners.map(corner => corner.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y, rotation: 0, flipX: false };
}

function groupCenter(states) {
  const bounds = getGroupBounds(states);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

function operationCenter(states, operation, key = 'center') {
  const value = operation[key];
  if (value == null) return groupCenter(states);
  if (!point(value)) throw new Error(`${key} must contain finite x and y coordinates.`);
  return { x: value.x, y: value.y };
}

function transformedVisibleState(state, operation, center) {
  const originalCenter = { x: state.x + state.width / 2, y: state.y + state.height / 2 };
  let x = state.x, y = state.y, width = state.width, height = state.height;
  let rotation = Number.isFinite(state.rotation) ? state.rotation : 0;
  let flipX = !!state.flipX;
  if (operation.type === 'move') {
    x += operation.dx; y += operation.dy;
  } else if (operation.type === 'scale') {
    const nextCenter = { x: center.x + (originalCenter.x - center.x) * operation.factor, y: center.y + (originalCenter.y - center.y) * operation.factor };
    width *= operation.factor; height *= operation.factor;
    x = nextCenter.x - width / 2; y = nextCenter.y - height / 2;
  } else if (operation.type === 'rotate') {
    const radians = operation.degrees * Math.PI / 180;
    const dx = originalCenter.x - center.x, dy = originalCenter.y - center.y;
    const nextCenter = { x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians), y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians) };
    x = nextCenter.x - width / 2; y = nextCenter.y - height / 2;
    rotation += operation.degrees;
  } else if (operation.type === 'flip') {
    if (operation.axis === 'x') {
      x = center.x - (originalCenter.x - center.x) - width / 2;
      rotation = -rotation;
    } else {
      y = center.y - (originalCenter.y - center.y) - height / 2;
      rotation = 180 - rotation;
    }
    flipX = !flipX;
  }
  return { x, y, width, height, rotation, flipX };
}

export function transformGroup(placements, states, operation) {
  if (!Array.isArray(placements) || !Array.isArray(states) || placements.length !== states.length || !placements.length) {
    throw new Error('Placements and visible states must be nonempty arrays of equal length.');
  }
  validateStates(states);
  if (!operation || typeof operation.type !== 'string') throw new Error('A group transform operation is required.');
  if (operation.type === 'move') {
    if (!finite(operation.dx) || !finite(operation.dy)) throw new Error('Move deltas must be finite.');
  } else if (operation.type === 'scale') {
    if (!finite(operation.factor) || operation.factor <= 0) throw new Error('Scale factor must be positive and finite.');
  } else if (operation.type === 'rotate') {
    if (!finite(operation.degrees)) throw new Error('Rotation degrees must be finite.');
  } else if (operation.type === 'flip') {
    if (!['x', 'y'].includes(operation.axis)) throw new Error('Flip axis must be x or y.');
  } else throw new Error(`Unknown group transform: ${operation.type}.`);
  const center = operation.type === 'move' ? null : operationCenter(states, operation, operation.type === 'scale' ? 'anchor' : 'center');
  return placements.map((placement, index) => {
    const state = states[index], next = transformedVisibleState(state, operation, center);
    const offsetX = state.x - placement.x, offsetY = state.y - placement.y;
    return { id: placement.id, x: next.x - offsetX, y: next.y - offsetY, width: next.width, height: next.height, rotation: next.rotation, flipX: next.flipX };
  });
}

