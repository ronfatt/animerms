import { describe, expect, it } from 'vitest';
import { SeriesInputSchema } from '../src/schemas/series.schema.js';

describe('SeriesInputSchema', () => {
  it('accepts valid series input', () => {
    const parsed = SeriesInputSchema.parse({
      series_title: 'Pahlawan Ombak',
      theme: 'Hero awakening',
      core_conflict: 'Sea spirit conflict',
      episode_count: 10,
      primary_language: 'BM_SABAH',
      language_mode: 'BM_SABAH',
      ratio: '16:9',
      platform: 'FACEBOOK',
      style_mode: 'LOCAL_X_ANIME',
      world: {
        location: 'Sabah',
        subculture_focus: 'Bajau coastal village',
        recurring_motifs: ['stilt houses']
      },
      characters: [
        {
          id: 'hero',
          name: 'Ari',
          role: 'hero',
          short_bio: 'Young fisher',
          visual_signature: 'tan skin, woven sash',
          speech_style: 'short BM Sabah lines'
        }
      ],
      episode_duration_sec: 120,
      grids_per_episode: 2,
      panels_per_grid: 9
    });

    expect(parsed.series_title).toBe('Pahlawan Ombak');
    expect(parsed.platform).toBe('FACEBOOK');
  });

  it('rejects invalid ratio', () => {
    expect(() =>
      SeriesInputSchema.parse({
        series_title: 'Bad',
        theme: 'x',
        core_conflict: 'x',
        episode_count: 1,
        primary_language: 'BM_SABAH',
        language_mode: 'BM_SABAH',
        ratio: '1:1',
        style_mode: 'LOCAL_X_ANIME',
        world: { location: 'Sabah', subculture_focus: 'x', recurring_motifs: [] },
        characters: [
          {
            id: 'hero',
            name: 'Ari',
            role: 'hero',
            short_bio: 'x',
            visual_signature: 'x',
            speech_style: 'x'
          }
        ],
        episode_duration_sec: 120,
        grids_per_episode: 2,
        panels_per_grid: 9
      })
    ).toThrow();
  });
});
