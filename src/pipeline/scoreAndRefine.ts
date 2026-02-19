import { SYSTEM_JSON_ONLY } from '../prompts/system.js';
import { buildStoryboardPrompt } from '../prompts/storyboard.js';
import { generateOpenAiJson } from '../providers/openai.js';
import { EpisodeOutputSchema, ScoringOutputSchema } from '../schemas/episode.schema.js';
import type { EpisodeOutput, ScoringOutput, StoryOutput } from '../schemas/episode.schema.js';
import type { SeriesInput } from '../schemas/series.schema.js';

export async function scoreEpisodeOutputDraft(draft: EpisodeOutput): Promise<ScoringOutput> {
  return generateOpenAiJson({
    schema: ScoringOutputSchema,
    system: SYSTEM_JSON_ONLY,
    label: 'episode qc scoring output',
    user: `
Score this EpisodeOutput draft for production QC.

Requirements:
- Return qc_scores with values from 0 to 10.
- Include comments (what works / what fails).
- Include revise_instructions that can be directly applied to storyboard regeneration.
- Be concrete and actionable.

Draft:
${JSON.stringify(draft)}
`.trim()
  });
}

export function shouldRefineFromQc(score: ScoringOutput): boolean {
  const metrics = score.qc_scores;
  return (
    metrics.overall < 7 ||
    metrics.narrative_clarity < 7 ||
    metrics.local_language_naturalness < 7 ||
    metrics.visual_animatability < 7 ||
    metrics.consistency < 7
  );
}

export async function regenerateEpisodeOutputFromStoryboard(
  story: StoryOutput,
  reviseInstructions: string[],
  context: {
    ratio: SeriesInput['ratio'];
    primaryLanguage: SeriesInput['primary_language'];
    languageMode: SeriesInput['language_mode'];
    subcultureFocus: string;
    platform?: SeriesInput['platform'];
  }
): Promise<EpisodeOutput> {
  return generateOpenAiJson({
    schema: EpisodeOutputSchema,
    system: SYSTEM_JSON_ONLY,
    label: 'refined episode output',
    user: buildStoryboardPrompt(story, {
      reviseInstructions,
      ratio: context.ratio,
      primaryLanguage: context.primaryLanguage,
      languageMode: context.languageMode,
      subcultureFocus: context.subcultureFocus,
      platform: context.platform
    })
  });
}
