import type { EpisodeInput } from '../schemas/episode.schema.js';
import type { SeriesInput } from '../schemas/series.schema.js';

function buildLanguageRule(series: SeriesInput): string {
  const languageMode = series.language_mode;
  if (languageMode === 'HYBRID') {
    const focus = series.world.subculture_focus.toLowerCase();
    const ethnicHint = focus.includes('suluk') ? 'Suluk' : focus.includes('bajau') ? 'Bajau' : 'Suluk/Bajau';
    return [
      `- Primary language baseline: ${series.primary_language}.`,
      `- Sprinkle 10-20% ${ethnicHint} words/phrases naturally based on world.subculture_focus.`,
      '- Keep the base sentence understandable in BM_SABAH.'
    ].join('\n');
  }

  if (languageMode !== 'BM_SABAH') {
    return `- Dialogue language override: use ${languageMode} for all lines.`;
  }

  return `- All dialogue lines must be in ${languageMode}.`;
}

function buildPlatformOpeningRule(series: SeriesInput): string {
  if (series.platform === 'YOUTUBE' || series.platform === 'FACEBOOK') {
    return [
      '- Platform opening rules:',
      '- First shot must contain visible conflict or emotional intensity.',
      '- No slow environmental intro.',
      '- First dialogue must appear within 5 seconds.',
      '- Avoid pure narration intro.'
    ].join('\n');
  }
  return '- Platform opening rules: standard pacing.';
}

function buildPlatformVisualRule(series: SeriesInput): string {
  if (series.ratio === '9:16' && series.platform === 'FACEBOOK') {
    return [
      '- Facebook visual preference:',
      '- avoid overly heavy anime stylization.',
      '- use semi-real anime with realistic skin tones.',
      '- emphasize local realism textures: humidity, sea wind, rain particles, cloth texture.'
    ].join('\n');
  }
  return '- Platform visual preference: default LOCAL_X_ANIME balance.';
}

export function buildStoryPrompt(series: SeriesInput, episode: EpisodeInput | number): string {
  const episodeNo = typeof episode === 'number' ? episode : episode.episodeNumber;
  const titleHint = typeof episode === 'number' ? '' : episode.titleHint;
  const premise = typeof episode === 'number' ? '' : episode.premise;
  const keyBeats = typeof episode === 'number' ? [] : episode.keyBeats;
  const continuityNotes = typeof episode === 'number' ? [] : episode.continuityNotes;
  const memoryContext =
    typeof episode === 'number'
      ? ''
      : continuityNotes.length > 0
        ? `\nContinuity memory:\n- ${continuityNotes.join('\n- ')}`
        : '';

  return `
Create episode story planning JSON for a dynamic comic episode.

Return this exact JSON structure and field names:
{
  "episodeTitle": string,
  "logline": string,
  "synopsis": string,
  "scenes": [
    {
      "sceneNumber": number,
      "location": string,
      "summary": string,
      "dialogueBeats": string[]
    }
  ],
  "draft_shot_count_target": number
}

Hard constraints:
- Episode duration is exactly 120 seconds.
- scenes should represent 8-10 narrative beats total.
- Beat timeline must cover these arcs:
  - hook: 0-15s
  - setup: 15-40s
  - awakening/decision: 40-70s
  - escalation: 70-100s
  - cliffhanger: 100-120s
- dialogue lines are short, punchy, comic-like.
- draft_shot_count_target must be an integer between 12 and 18.
- scene/dialogue beats must align roughly to the beat timings.

Language constraints:
${buildLanguageRule(series)}

Platform constraints:
${buildPlatformOpeningRule(series)}
${buildPlatformVisualRule(series)}

Series:
- series_title: ${series.series_title}
- theme: ${series.theme}
- core_conflict: ${series.core_conflict}
- episode_count: ${series.episode_count}
- primary_language: ${series.primary_language}
- language_mode: ${series.language_mode}
- ratio: ${series.ratio}
- platform: ${series.platform ?? 'N/A'}
- style_mode: ${series.style_mode}
- style_variant: ${series.style_variant ?? 'N/A'}
- genre_tags: ${series.genre_tags.join(', ') || 'none'}
- story_outline: ${series.story_outline ?? 'N/A'}
- world.location: ${series.world.location}
- world.subculture_focus: ${series.world.subculture_focus}
- world.recurring_motifs: ${series.world.recurring_motifs.join('; ') || 'none'}
- characters: ${series.characters.map((c) => `${c.id}:${c.name} (${c.role}) - ${c.short_bio} | visual=${c.visual_signature} | speech=${c.speech_style}`).join(' || ')}
- episode_duration_sec: ${series.episode_duration_sec}
- grids_per_episode: ${series.grids_per_episode}
- panels_per_grid: ${series.panels_per_grid}

Episode input:
- episode_no: ${episodeNo}
- titleHint: ${titleHint || 'N/A'}
- premise: ${premise || 'N/A'}
- keyBeats: ${keyBeats.join('; ') || 'none'}
- continuity: ${continuityNotes.join('; ') || 'none'}
${memoryContext}

Quality target:
- Strong local flavor, clear progression, visualizable action, emotional hook at end.
`.trim();
}

export function buildStoryPromptWithMemory(
  series: SeriesInput,
  episodeNo: number,
  memory: { bible?: string; state?: string; recentEpisodes?: string }
): string {
  const memoryBlock = [
    memory.bible ? `Series Bible (locked):\n${memory.bible}` : '',
    memory.state ? `Series State:\n${memory.state}` : '',
    memory.recentEpisodes ? `Recent Episode Summaries:\n${memory.recentEpisodes}` : ''
  ]
    .filter(Boolean)
    .join('\n\n');

  const base = buildStoryPrompt(series, episodeNo);
  if (!memoryBlock) return base;
  return `${base}\n\nContinuity Context (must obey):\n${memoryBlock}`;
}

export function buildEpisodeOutputDraftPrompt(series: SeriesInput, episodeNo: number): string {
  const ratioRule =
    series.ratio === '9:16'
      ? 'If ratio=9:16: focus on characters, face emotions, vertical depth; fewer wide establishing shots.'
      : 'If ratio=16:9: allow wider establishing beats and more location details.';

  return `
Generate Episode ${episodeNo} as JSON following the EpisodeOutput schema fields you can fill now:
- title, logline, beat_outline (8-10 beats), dialogues (rough time aligned), and ratio + safe_area_notes.

Constraints:
- Total duration: 120 seconds.
- Beats must include: hook (0-15s), setup (15-40s), decision/awakening (40-70s), escalation (70-100s), cliffhanger (100-120s).
- Dialogues in selected language_mode, primarily BM_SABAH.
- Keep each line <= 12 words where possible.

Ratio rules:
- ${ratioRule}

Platform rules:
${buildPlatformOpeningRule(series)}

Input:
${JSON.stringify(series)}
`.trim();
}
