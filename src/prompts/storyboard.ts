import type { StoryOutput } from '../schemas/episode.schema.js';
import type { AspectRatio, Platform, SeriesInput } from '../schemas/series.schema.js';

type StoryboardPromptOptions = {
  reviseInstructions?: string[];
  ratio?: AspectRatio;
  primaryLanguage?: SeriesInput['primary_language'];
  languageMode?: SeriesInput['language_mode'];
  subcultureFocus?: string;
  platform?: Platform;
};

export function buildStoryboardPrompt(story: StoryOutput, options?: StoryboardPromptOptions): string {
  const ratio = options?.ratio ?? '16:9';
  const ratioRules =
    ratio === '9:16'
      ? [
          '- 9:16 fixed rules:',
          '- Design for vertical smartphone viewing.',
          '- Emphasize character expressions and emotional beats.',
          '- At least 60% of shots must be MS or CU.',
          '- Wide shots (WS) cannot exceed 25% of total shots.',
          '- Character priority: prefer MS/CU framing.',
          '- Background must show vertical depth: foreground objects (wood poles/fishing nets) + distant sea.',
          '- Each shot must center subject vertically or use upper-third framing.',
          '- Avoid excessive empty sky or sea areas.',
          '- Title/subtitle safety: reserve top 10% and bottom 18% safe zones.',
          '- Camera movement preference: push_in / tilt / handheld; avoid overusing ultra-wide establishing shots.',
          '- Emotional close-ups (CU/ECU) should appear at least every 20-30 seconds.'
        ].join('\n')
      : [
          '- 16:9 fixed rules:',
          '- Establishing shots are important: WS/MS should be used more often.',
          '- Subtitle safe area: reserve 12-15% bottom height.',
          '- Use wide worldbuilding compositions: coastline, village panoramas, storm cloud layers.'
        ].join('\n');
  const platformRules =
    options?.platform === 'YOUTUBE' || options?.platform === 'FACEBOOK'
      ? [
          'Platform opening rules (YOUTUBE/FACEBOOK):',
          '- First shot must contain visible conflict or emotional intensity.',
          '- No slow environmental intro.',
          '- First dialogue must appear within 5 seconds.',
          '- Avoid pure narration intro.'
        ].join('\n')
      : '';
  const platformStyleRule =
    ratio === '9:16' && options?.platform === 'FACEBOOK'
      ? [
          'Facebook 9:16 visual style rules:',
          '- Avoid overly heavy anime look.',
          '- Prefer semi-real anime over pure stylized anime.',
          '- Keep skin tones realistic.',
          '- Emphasize local environmental realism: humidity haze, sea wind, rain particles, fabric texture.'
        ].join('\n')
      : '';
  const languageRule =
    options?.languageMode === 'HYBRID'
      ? `Dialogues should stay mainly ${options.primaryLanguage ?? 'BM_SABAH'} with 10-20% Suluk/Bajau terms, guided by subculture focus: ${options.subcultureFocus ?? 'N/A'}.`
      : options?.languageMode && options.languageMode !== 'BM_SABAH'
        ? `Dialogues should use ${options.languageMode}.`
        : `Dialogues should use ${options?.primaryLanguage ?? 'BM_SABAH'}.`;
  const revisionBlock =
    options?.reviseInstructions && options.reviseInstructions.length > 0
      ? `
Revision instructions (must apply in this generation):
${options.reviseInstructions.map((item, index) => `${index + 1}. ${item}`).join('\n')}

Focus refinement on shotlist quality and dialogue cleanup while preserving core story intent.
`
      : '';

  return `
Convert this story output into an EpisodeOutput JSON with a cinematic shotlist (anime energy + Sabah local flavor).

Return ONLY JSON with this exact top-level structure:
{
  "episode_no": number,
  "ratio": "16:9" | "9:16",
  "title": string,
  "logline": string,
  "beat_outline": [
    { "beat_no": number, "purpose": string, "time_sec_range": [number, number], "summary": string }
  ],
  "dialogues": [
    { "t_sec": number, "character_id": string, "line": string, "subtitle": string }
  ],
  "shotlist": [
    {
      "shot_no": number,
      "time_sec_range": [number, number],
      "camera": {
        "framing": "WS" | "MS" | "CU" | "ECU",
        "angle": "eye" | "low" | "high" | "dutch",
        "movement": "static" | "push_in" | "pull_out" | "pan" | "tilt" | "handheld" | "orbit"
      },
      "action": string,
      "emotion": string,
      "environment_fx": string[],
      "composition_notes": string
    }
  ],
  "gemini_prompts": { "gridA": string, "gridB": string },
  "kling_prompts": [
    { "shot_no": number, "duration_sec": number, "prompt": string }
  ],
  "engagement_hook": {
    "question": string,
    "pin_comment_suggestion": string
  },
  "safe_area_notes": string[],
  "edit_notes": string[],
  "qc_scores": {
    "narrative_clarity": number,
    "local_language_naturalness": number,
    "visual_animatability": number,
    "consistency": number,
    "overall": number
  }
}

Hard rules:
- shotlist must contain 12-18 shots.
- Every shot duration must be 4-8 seconds.
- Total shotlist duration should be approximately 120 seconds.
- Every shot action must contain a clear action verb.
- Every shot must have camera movement specified in camera.movement.
- Every shot must include 1-2 environment_fx chosen from:
  ["wind", "wave spray", "rain", "neon flicker", "dust"].
- Every shot must include composition_notes describing foreground, midground, and background layers for parallax.
- Target output ratio is ${ratio}.
${ratioRules}
${platformRules}
${platformStyleRule}
- ${languageRule}
- Keep anime cinematic language while grounding visuals in Sabah context (coastal villages, markets, jetties, rain, signage, local texture).
- safe_area_notes must be auto-generated text placement guidance for this ratio (captions/subtitles should stay in safe zones, avoid edge clipping, avoid covering faces/action).

Output completion rules:
- Keep beat_outline and dialogues coherent with the provided story.
- Fill gemini_prompts and kling_prompts with placeholders if needed, but keep valid structure.
- Keep qc_scores realistic numeric values (0-10).
${revisionBlock}

Story:
${JSON.stringify(story)}
`.trim();
}

export function buildProductionShotlistPrompt(story: StoryOutput, series: SeriesInput): string {
  const ratioRule =
    series.ratio === '9:16'
      ? '- 9:16: prioritize MS/CU, ensure subject centered or upper-third, keep headroom; avoid wide emptiness.'
      : '- 16:9: allow WS/MS variety and environment storytelling.';

  const languageRule =
    series.language_mode === 'HYBRID'
      ? `- Dialogues should stay mainly ${series.primary_language} with 10-20% ethnic terms guided by subculture focus: ${series.world.subculture_focus}.`
      : series.language_mode === 'BM_SABAH'
        ? `- Dialogues should use ${series.primary_language}.`
        : `- Dialogues should use ${series.language_mode}.`;
  const platformRule =
    series.platform === 'YOUTUBE' || series.platform === 'FACEBOOK'
      ? [
          '- Platform opening rules (YOUTUBE/FACEBOOK):',
          '- First shot must contain visible conflict or emotional intensity.',
          '- No slow environmental intro.',
          '- First dialogue must appear within 5 seconds.',
          '- Avoid pure narration intro.'
        ].join('\n')
      : '- Platform opening rules: standard pacing.';
  const platformStyleRule =
    series.ratio === '9:16' && series.platform === 'FACEBOOK'
      ? [
          '- Facebook 9:16 style rule:',
          '- semi-real anime > pure stylized anime.',
          '- realistic skin tone rendering.',
          '- local texture realism: humidity, sea wind, rain particles, cloth/fabric details.'
        ].join('\n')
      : '- Platform style rule: standard LOCAL_X_ANIME balance.';

  return `
Convert the episode story into a production-ready shotlist.
Return JSON matching EpisodeOutput with:
- shotlist (12-18 shots), improved dialogues cleanup, and composition_notes per shot.

Rules per shot:
- 4-8 seconds each, total ~120s.
- MUST include: action verb + camera movement + 1-3 environment_fx.
- composition_notes must specify foreground/midground/background for parallax.

Ratio rules:
${ratioRule}

Platform rules:
${platformRule}
${platformStyleRule}

Character consistency:
- Keep character appearance consistent with these visual_signature tokens:
${series.characters.map((character) => `${character.id}: ${character.visual_signature}`).join('\n')}

Language rules:
${languageRule}

Input:
Episode story JSON:
${JSON.stringify(story)}

SeriesInput JSON:
${JSON.stringify(series)}
`.trim();
}
