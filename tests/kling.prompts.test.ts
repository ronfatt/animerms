import { describe, expect, it } from 'vitest';
import { buildKlingPrompts } from '../src/prompts/kling_shots.js';

describe('buildKlingPrompts', () => {
  it('clamps duration between 4 and 8 seconds', () => {
    const prompts = buildKlingPrompts({
      title: 'Episode',
      logline: 'logline',
      ratio: '9:16',
      platform: 'FACEBOOK',
      character_visual_signatures: ['tan skin, woven sash'],
      shotlist: [
        {
          shot_no: 1,
          time_sec_range: [0, 2],
          camera: { framing: 'CU', angle: 'eye', movement: 'push_in' },
          action: 'strikes',
          emotion: 'angry',
          environment_fx: ['rain']
        },
        {
          shot_no: 2,
          time_sec_range: [2, 20],
          camera: { framing: 'MS', angle: 'low', movement: 'handheld' },
          action: 'runs',
          emotion: 'fear',
          environment_fx: ['wind']
        }
      ]
    });

    expect(prompts[0].duration_sec).toBe(4);
    expect(prompts[1].duration_sec).toBe(8);
    expect(prompts[0].prompt).toContain('Vertical cinematic anime shot, 9:16.');
  });
});
