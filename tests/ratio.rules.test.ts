import { describe, expect, it } from 'vitest';
import { buildRatioComplianceInstructions } from '../src/pipeline/ratioRules.js';
import type { EpisodeOutput } from '../src/schemas/episode.schema.js';

const episodeBase: EpisodeOutput = {
  episode_no: 1,
  ratio: '9:16',
  title: 't',
  logline: 'l',
  beat_outline: [{ beat_no: 1, purpose: 'p', time_sec_range: [0, 120], summary: 's' }],
  dialogues: [{ t_sec: 8, character_id: 'hero', line: 'Hai', subtitle: 'Hai' }],
  shotlist: [
    {
      shot_no: 1,
      time_sec_range: [0, 10],
      camera: { framing: 'WS', angle: 'eye', movement: 'static' },
      action: 'looks at sea',
      emotion: 'calm',
      environment_fx: ['wind'],
      composition_notes: 'wide beach scene'
    },
    {
      shot_no: 2,
      time_sec_range: [10, 20],
      camera: { framing: 'WS', angle: 'eye', movement: 'static' },
      action: 'walks slowly',
      emotion: 'calm',
      environment_fx: ['wind'],
      composition_notes: 'wide sky and sea'
    }
  ],
  gemini_prompts: { gridA: 'a', gridB: 'b' },
  kling_prompts: [{ shot_no: 1, duration_sec: 5, prompt: 'p' }],
  engagement_hook: { question: 'q', pin_comment_suggestion: 'p' },
  safe_area_notes: ['generic safe note'],
  edit_notes: [],
  qc_scores: {
    narrative_clarity: 6,
    local_language_naturalness: 6,
    visual_animatability: 6,
    consistency: 6,
    overall: 6
  }
};

describe('buildRatioComplianceInstructions', () => {
  it('returns instructions for violating 9:16 constraints', () => {
    const issues = buildRatioComplianceInstructions(episodeBase);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join(' ')).toMatch(/60%/);
    expect(issues.join(' ')).toMatch(/bottom 18%/i);
  });
});
