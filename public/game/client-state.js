import { normalizeWorldOrder, worldOrdinal } from './world-order.js';
// Coordinator metadata never replaces the browser's active gameplay state.
export function worldProgressModel(state={},order){
  const route=normalizeWorldOrder(state.level===0?(order??state.worldOrder):(state.worldOrder??order));
  return {order:route,ordinal:worldOrdinal(state.level??0,route),done:route.map(id=>!!state.finished||!!state.completedWorlds?.includes(id))};
}
export function mergePlayerPatch(player,patch){
  const {state:ignored,summary,...metadata}=patch;
  return {...player,...metadata,summary:{...player.summary,...summary}};
}
// Attackers wait for all defenses; defenders resume after their own accepted answer.
export function isDuelFrozen(duel,playerId,quiz){
  if(!duel||!playerId||duel.phase==='effect')return false;
  if(duel.casterId===playerId)return true;
  return duel.phase==='defense'&&!!duel.targetIds?.includes(playerId)&&!(quiz?.transactionId===duel.id&&quiz.answered);
}
export function runtimeMismatch(health,loadedVersion=null){
  if(!health?.runtimeVersion)return 'This server is running an older game build. Restart the game server and refresh this page.';
  if(health.needsRestart||health.diskVersion!==health.runtimeVersion)return 'Game files changed after the server started. Restart the game server before starting another round.';
  if(loadedVersion&&loadedVersion!==health.runtimeVersion)return 'The game was updated after this page loaded. Refresh this page before joining another room.';
  return null;
}
