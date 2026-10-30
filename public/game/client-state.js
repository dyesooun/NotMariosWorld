import { normalizeWorldOrder, worldOrdinal } from './world-order.js';
// Predictions make movement responsive. Persistent saves are authoritative.
export function worldProgressModel(state={},order){
  const route=normalizeWorldOrder(state.level===0?(order??state.worldOrder):(state.worldOrder??order));
  return {order:route,ordinal:worldOrdinal(state.level??0,route),done:route.map(id=>!!state.finished||!!state.completedWorlds?.includes(id))};
}
export function checkpointRenderState(predicted,authoritative){
  if(!predicted)return authoritative;
  return {...predicted,checkpoint:authoritative?.checkpoint??null};
}
export function runtimeMismatch(health,loadedVersion=null){
  if(!health?.runtimeVersion)return 'This server is running an older game build. Restart the game server and refresh this page.';
  if(health.needsRestart||health.diskVersion!==health.runtimeVersion)return 'Game files changed after the server started. Restart the game server before starting another round.';
  if(loadedVersion&&loadedVersion!==health.runtimeVersion)return 'The game was updated after this page loaded. Refresh this page before joining another room.';
  return null;
}
