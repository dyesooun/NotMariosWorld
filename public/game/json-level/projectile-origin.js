import { projectileSpawnOffset } from '../projectiles.js';
import { localToWorld } from './transforms.js';

// Shared by fired projectiles and the editor's spawn marker.
export function projectileSpawnPoint(state) {
  const pivot = state.visual.pivot || [.5, 1];
  const offset = projectileSpawnOffset(state.visual, state.behavior);
  return localToWorld(state, { x: (pivot[0] + offset[0]) * state.width, y: (pivot[1] + offset[1]) * state.height });
}
