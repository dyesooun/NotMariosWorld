import { randomUUID } from 'node:crypto';
import { choosePowerQuestion, isCorrectPowerAnswer } from './power-questions.js';
import { powerStrength } from '../public/game/powers.js';

const eligible = (room, caster) => [...room.players.values()].filter(p => p !== caster && p.connected && p.spawned && !p.state.finished);
const eligibleTarget = (room, entry, caster) => {
  if (entry.source !== 'coin') return eligible(room, caster);
  const target = room.players.get(entry.targetId);
  return target && target.runId === entry.targetRunId && target !== caster && target.connected && target.spawned && !target.state.finished ? [target] : [];
};
const currentParticipant = (room, player, runId) => room.players.get(player.id) === player && player.connected && player.spawned && player.runId === runId && !player.state.finished;
const validDefenses = (room, duel) => [...duel.defenses.values()].filter(d => currentParticipant(room, d.player, d.runId));
function resolveDefenses(room, duel, now) {
  const valid = validDefenses(room, duel);
  if (!valid.every(d => d.answered)) return false;
  duel.outcome = valid.some(d => d.result !== 'correct') ? 'success' : 'blocked';
  duel.phase = 'effect'; duel.endsAt = now + duel.entry.power.durationMs;
  return true;
}
export function beginPowerDuel(room, entry, { now = Date.now(), random = Math.random } = {}) {
  const caster = entry.caster, hostAttack = entry.source === 'host';
  const slot = caster?.powerSlots?.[entry.level];
  if (room.status !== 'running' || room.powerDuel || room.activePower) return { ok:false, code:'POWER_UNAVAILABLE' };
  if (entry.source === 'coin' && (!caster?.connected || entry.runId !== caster.runId || caster.state?.finished)) return { ok:false, code:'POWER_UNAVAILABLE' };
  if (!hostAttack && entry.source !== 'coin' && (!caster?.connected || (entry.runId && entry.runId !== caster.runId) || !slot?.claimed || slot.used || slot.reserved !== entry.id || (entry.itemId && slot.itemId !== entry.itemId))) return { ok:false, code:'POWER_UNAVAILABLE' };
  if (hostAttack && !entry.power?.type) return { ok:false, code:'POWER_UNAVAILABLE' };
  const targets = eligibleTarget(room, entry, hostAttack ? null : caster);
  if (!targets.length) return { ok:false, code:'NO_TARGET' };
  if (!hostAttack && entry.source !== 'coin') { slot.used = true; slot.reserved = null; }
  const attackMs = Math.max(1000, Number(room.settings?.attackWindowSeconds ?? 10) * 1000);
  const defendMs = Math.max(1000, Number(room.settings?.defendWindowSeconds ?? 10) * 1000);
  const durationMs = Math.max(1000, Number(room.settings?.powerDurationSeconds ?? (entry.power.durationMs / 1000)) * 1000);
  entry.power = { ...entry.power, target: entry.source === 'coin' ? 'player' : 'all', durationMs, strength: powerStrength(room.settings, entry.power.type) };
  const duel = { id:randomUUID(),entry,caster,casterRunId:caster?.runId,random,attackMs,defendMs,phase:hostAttack?'defense':'attack',startedAt:now,endsAt:now+(hostAttack?defendMs:attackMs),attackQuestion:hostAttack?null:choosePowerQuestion({random}),attackAnswered:hostAttack?{correct:true,result:'host'}:null,defenses:new Map(),targets, outcome:null,affectedIds:[] };
  if (hostAttack) {
    const usedQuestions = [];
    for (const target of targets) { const question=choosePowerQuestion({random,excludedIds:usedQuestions}); usedQuestions.push(question.id); duel.defenses.set(target.id,{player:target,runId:target.runId,question,result:null,answered:false}); }
  }
  room.powerDuel = duel;
  return { ok:true,duel };
}
export function answerPowerDuel(room, player, { transactionId, challengeId, answer, now = Date.now() } = {}) {
  const duel = room?.powerDuel;
  if (!duel || room.status !== 'running' || now >= duel.endsAt) return { ok:false,code:'QUIZ_CLOSED' };
  if (typeof answer !== 'string' || answer.length > 120 || transactionId !== duel.id) return { ok:false,code:'QUIZ_INVALID' };
  if (duel.phase === 'attack') {
    if (player !== duel.caster || player.runId !== duel.casterRunId || !player.connected || challengeId !== duel.attackQuestion.id || duel.attackAnswered) return { ok:false,code:'QUIZ_INVALID' };
    const correct = isCorrectPowerAnswer(duel.attackQuestion,answer);
    duel.attackAnswered = { correct,result:correct?'correct':'incorrect' };
    if (!correct) {
      duel.outcome='attackerFailed';duel.phase='effect';duel.endsAt=now+duel.entry.power.durationMs;
      return { ok:true,correct,role:'attack',advance:true };
    }
    const available=eligibleTarget(room,duel.entry,duel.caster),random=duel.random;
    duel.targets=available;
    duel.phase='defense';duel.endsAt=now+duel.defendMs;
    const usedQuestions=[duel.attackQuestion.id];
    for(const target of duel.targets){
      const question=choosePowerQuestion({random,excludedIds:usedQuestions});usedQuestions.push(question.id);
      duel.defenses.set(target.id,{player:target,runId:target.runId,question,result:null,answered:false});
    }
    resolveDefenses(room,duel,now);
    return { ok:true,correct,role:'attack',advance:true };
  }
  if(duel.phase!=='defense')return {ok:false,code:'QUIZ_CLOSED'};
  const defense=duel.defenses.get(player.id);
  if(!defense||defense.player!==player||!currentParticipant(room,player,defense.runId)||defense.answered||challengeId!==defense.question.id)return {ok:false,code:'QUIZ_INVALID'};
  const correct=isCorrectPowerAnswer(defense.question,answer);defense.answered=true;defense.result=correct?'correct':'incorrect';
  const advance=resolveDefenses(room,duel,now);
  return {ok:true,correct,role:'defense',advance};
}
export function advancePowerDuel(room,{now=Date.now()}={}){
  const duel=room?.powerDuel;if(!duel||now<duel.endsAt)return false;
  if(duel.phase==='attack'){
    duel.attackAnswered={correct:false,result:'timeout'};duel.outcome='attackerFailed';duel.phase='effect';duel.endsAt=now+duel.entry.power.durationMs;return true;
  }
  if(duel.phase==='defense'){
    for(const defense of validDefenses(room,duel))if(!defense.answered){defense.answered=true;defense.result='timeout';}
    return resolveDefenses(room,duel,now);
  }
  return false;
}
export function prunePowerDuel(room,{now=Date.now()}={}){
  const duel=room?.powerDuel;if(!duel||duel.phase!=='defense')return false;
  for(const defense of duel.defenses.values())if(!currentParticipant(room,defense.player,defense.runId)){defense.answered=true;defense.result='skipped';}
  return resolveDefenses(room,duel,now);
}
export function isDuelFrozen(room, player) {
  const duel = room?.powerDuel;
  if (!duel || duel.phase === 'effect') return false;
  if (duel.caster === player && player.runId === duel.casterRunId) return true;
  if (duel.phase !== 'defense') return false;
  const defense = duel.defenses.get(player.id);
  return !!defense && defense.player === player && defense.runId === player.runId;
}
export function duelView(room){
  const duel=room?.powerDuel;if(!duel)return null;
  const answeredCount=duel.phase==='attack'?(duel.attackAnswered?1:0):[...duel.defenses.values()].filter(d=>d.answered).length;
  const blockedCount=[...duel.defenses.values()].filter(d=>d.result==='correct').length;
  const targetIds=validDefenses(room,duel).map(d=>d.player.id);
  return {id:duel.id,source:duel.entry.source||'player',phase:duel.phase,casterId:duel.entry.source==='host'?null:duel.caster?.id,casterName:duel.entry.source==='host'?'Host':duel.caster?.name,power:{...duel.entry.power},endsAt:duel.endsAt,targetIds,defenderTotal:duel.targets.length,answeredCount,blockedCount,outcome:duel.outcome,affectedIds:[...duel.affectedIds]};
}
export function privateDuelQuiz(room,player){
  const duel=room?.powerDuel;if(!duel)return null;
  if(duel.phase==='attack'&&player===duel.caster&&player.runId===duel.casterRunId&&player.connected)return {id:duel.attackQuestion.id,transactionId:duel.id,role:'attack',prompt:duel.attackQuestion.prompt,endsAt:duel.endsAt,durationMs:duel.attackMs,answered:!!duel.attackAnswered,result:duel.attackAnswered?.result??null};
  const defense=duel.phase==='defense'?duel.defenses.get(player.id):null;
  if(!defense||!currentParticipant(room,player,defense.runId))return null;
  return {id:defense.question.id,transactionId:duel.id,role:'defense',prompt:defense.question.prompt,endsAt:duel.endsAt,durationMs:duel.defendMs,answered:defense.answered,result:defense.result};
}
