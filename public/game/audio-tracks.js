/* Shipped music assets. Paths are intentionally root-relative for the browser. */
const track = (id, src) => Object.freeze({ id, src });

export const MUSIC_TRACKS = Object.freeze({
  lobby: track('lobby', '/assets/audio/lobby/lobby_main_loop_30s.wav'),
  forest: track('forest', '/assets/audio/forest/music/forest_danger_full_loop_30s.wav'),
  ocean: track('ocean', '/assets/audio/tide/music/tides_danger_full_loop_30s.wav'),
  hell: track('hell', '/assets/audio/hell/music/hell_danger_full_loop_30s.wav'),
  results: track('results', '/assets/audio/lobby/podium_main_loop_30s.wav')
});

export const VICTORY_TRACKS = Object.freeze({
  forest: Object.freeze({ src: '/assets/audio/forest/music/forest_victory_stinger.wav', durationSeconds: 4.3 }),
  ocean: Object.freeze({ src: '/assets/audio/tide/music/tides_victory_stinger.wav', durationSeconds: 4.4 }),
  hell: Object.freeze({ src: '/assets/audio/hell/music/hell_victory_stinger.wav', durationSeconds: 4.4 })
});
