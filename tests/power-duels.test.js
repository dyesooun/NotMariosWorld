import test from 'node:test';
import assert from 'node:assert/strict';
import { beginPowerDuel, answerPowerDuel, advancePowerDuel, duelView, privateDuelQuiz } from '../server/power-duels.js';

const makePlayer = id => ({ id, name: id, connected: true, spawned: true, state: { finished: false }, power: { testing: false } });
const makeRoom = () => {
  const caster = makePlayer('caster'), defender = makePlayer('defender');
  caster.powerSlots = { 1: { claimed: true, used: false, reserved: 'power-1', power: { type: 'slow', name: 'Sticky Boots', target: 'random', durationMs: 5000 } } };
  caster.state.level = 1;
  return { status: 'running', players: new Map([[caster.id, caster], [defender.id, defender]]), caster, defender, activePower: null };
};

test('attack correct creates private defense quiz and early defense completion', () => {
  const room = makeRoom();
  const started = beginPowerDuel(room, { id: 'power-1', caster: room.caster, level: 1, power: room.caster.powerSlots[1].power });
  assert.equal(started.ok, true);
  const attack = privateDuelQuiz(room, room.caster);
  const attackResult = answerPowerDuel(room, room.caster, { transactionId: room.powerDuel.id, challengeId: attack.id, answer: room.powerDuel.attackQuestion.answers[0], now: 1 });
  assert.equal(attackResult.correct, true);
  const defense = privateDuelQuiz(room, room.defender);
  assert.equal(defense.role, 'defense');
  const defenseResult = answerPowerDuel(room, room.defender, { transactionId: room.powerDuel.id, challengeId: defense.id, answer: room.powerDuel.defenses.get(room.defender.id).question.answers[0], now: 2 });
  assert.equal(defenseResult.advance, true);
  assert.equal(duelView(room).phase, 'effect');
});

test('wrong attack becomes self-effect outcome and timeout advances', () => {
  const room = makeRoom();
  beginPowerDuel(room, { id: 'power-1', caster: room.caster, level: 1, power: room.caster.powerSlots[1].power }, { now: 0 });
  const attack = privateDuelQuiz(room, room.caster);
  const wrong = answerPowerDuel(room, room.caster, { transactionId: room.powerDuel.id, challengeId: attack.id, answer: 'wrong', now: 1 });
  assert.equal(wrong.correct, false);
  assert.equal(room.powerDuel.outcome, 'attackerFailed');
  const room2 = makeRoom(); beginPowerDuel(room2, { id: 'power-1', caster: room2.caster, level: 1, power: room2.caster.powerSlots[1].power }, { now: 0 });
  assert.equal(advancePowerDuel(room2, { now: 10000 }), true);
  assert.equal(room2.powerDuel.outcome, 'attackerFailed');
});
