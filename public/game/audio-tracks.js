/* Shipped music assets. Paths are intentionally root-relative for the browser. */
const track = (id, src) => Object.freeze({ id, src });

export const MUSIC_TRACKS = Object.freeze({
  lobby: track('lobby', '/assets/audio/lobby/lobby_main_loop_30s.compressed.flac'),
  forest: track('forest', '/assets/audio/forest/music/forest_danger_full_loop_30s.compressed.flac'),
  ocean: track('ocean', '/assets/audio/tide/music/tides_danger_full_loop_30s.compressed.flac'),
  hell: track('hell', '/assets/audio/hell/music/hell_danger_full_loop_30s.compressed.flac'),
  results: track('results', '/assets/audio/lobby/podium_main_loop_30s.compressed.flac')
});

export const VICTORY_TRACKS = Object.freeze({
  forest: Object.freeze({ src: '/assets/audio/forest/music/forest_victory_stinger.compressed.flac', durationSeconds: 4.3 }),
  ocean: Object.freeze({ src: '/assets/audio/tide/music/tides_victory_stinger.compressed.flac', durationSeconds: 4.4 }),
  hell: Object.freeze({ src: '/assets/audio/hell/music/hell_victory_stinger.compressed.flac', durationSeconds: 4.4 })
});
