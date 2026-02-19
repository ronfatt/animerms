import type { SeriesInput } from '../schemas/series.schema.js';

export type GridPart = 'A' | 'B';

export type GeminiGridPromptEpisode = {
  episode_no: number;
  title: string;
  logline: string;
  language_mode: SeriesInput['language_mode'];
  shotlist: Array<{
    shot_no: number;
    time_sec_range: [number, number];
    action: string;
    emotion: string;
    camera: {
      framing: 'WS' | 'MS' | 'CU' | 'ECU';
      angle: 'eye' | 'low' | 'high' | 'dutch';
      movement: 'static' | 'push_in' | 'pull_out' | 'pan' | 'tilt' | 'handheld' | 'orbit';
    };
    environment_fx: string[];
    composition_notes: string;
  }>;
  dialogues: Array<{
    t_sec: number;
    line: string;
    subtitle: string;
  }>;
};

export type GeminiGridPromptContext = {
  series_title: string;
  character_visual_signatures: string[];
  location_motifs: string[];
  ratio: SeriesInput['ratio'];
  subculture_focus: string;
  platform?: SeriesInput['platform'];
};

function getGridWindow(gridPart: GridPart): [number, number] {
  return gridPart === 'A' ? [0, 60] : [60, 120];
}

function sliceShotsForGrid(
  shotlist: GeminiGridPromptEpisode['shotlist'],
  gridPart: GridPart
): GeminiGridPromptEpisode['shotlist'] {
  const [start, end] = getGridWindow(gridPart);
  const inWindow = shotlist.filter((shot) => shot.time_sec_range[0] < end && shot.time_sec_range[1] > start);
  return inWindow.slice(0, 9);
}

function languageCaptionRule(languageMode: SeriesInput['language_mode']): string {
  if (languageMode === 'HYBRID') {
    return 'Captions must be BM_SABAH (short, natural, comic-like).';
  }
  return 'Captions must be BM_SABAH (short, natural, comic-like).';
}

function ratioGridRule(ratio: SeriesInput['ratio']): string {
  if (ratio === '9:16') {
    return [
      'If ratio=9:16:',
      'design for vertical smartphone viewing,',
      'emphasize character expressions and emotional beats,',
      'at least 60% of shots should read as MS/CU,',
      'wide-shot feeling must not exceed 25%,',
      'center subject vertically or use upper-third framing,',
      'avoid excessive empty sky/sea areas,',
      'build vertical depth (foreground nets/wood poles, mid character, background sea/sky),',
      'use push_in/tilt/handheld more frequently,',
      'ensure emotional close-up beats appear every 20-30 seconds,',
      'leave top 10% and bottom 18% safe areas.'
    ].join(' ');
  }
  return 'If ratio=16:9: compose each panel as cinematic wide frame, leave bottom 12% as subtitle safe area.';
}

function platformStyleRule(
  ratio: SeriesInput['ratio'],
  platform?: SeriesInput['platform']
): string {
  if (ratio === '9:16' && platform === 'FACEBOOK') {
    return [
      'Facebook 9:16 style lock:',
      'reduce heavy anime stylization,',
      'prioritize semi-real anime with realistic skin tones,',
      'increase local realism cues: humid air, sea wind, rain particles, textured fabrics.'
    ].join(' ');
  }
  return '';
}

function gridHeadline(ratio: SeriesInput['ratio']): string {
  if (ratio === '9:16') {
    return 'Create ONE vertical 3x3 storyboard grid (9 panels) in a single canvas. Each panel must be vertical 9:16 frame. Panels clearly separated.';
  }
  return 'Create ONE image: a clean 3x3 comic storyboard grid (9 panels) in a single canvas. Panels must be clearly separated.';
}

export function buildGeminiGridPrompt(
  episode: GeminiGridPromptEpisode,
  gridPart: GridPart,
  context: GeminiGridPromptContext
): string {
  const [startSec, endSec] = getGridWindow(gridPart);
  const selectedShots = sliceShotsForGrid(episode.shotlist, gridPart);
  const gridRange = gridPart === 'A' ? 'Part A covers 0-60s' : 'Part B covers 60-120s';

  return `
${gridHeadline(context.ratio)}

Style: LOCAL_X_ANIME, semi-real anime cinematic lighting, Sabah coastal vibe (stilt houses, sea nomad boats, tropical sky, storm mood).
${platformStyleRule(context.ratio, context.platform)}

Consistency: SAME character designs across all 9 panels. Use these fixed character tokens:
${context.character_visual_signatures.join(' | ')}

Grid Part: ${gridPart}
- ${gridRange}

Each panel:
- corresponds to one shot (describe the shot visually)
- include a SHORT caption in BM_SABAH (max 6 words) placed at bottom of the panel
- no long speech bubbles

Ratio instruction:
- ${ratioGridRule(context.ratio)}

9:16 composition hard rules:
- Strong character focus.
- Face or torso dominant in at least 6 panels.
- Vertical depth layering: foreground object + character + background.
- Leave top 10% and bottom 18% visually clean for text safe area.
- Short BM_SABAH caption (max 6 words) bottom center.

Avoid: wide empty horizon, tiny characters, messy clutter, distorted anatomy, deformed faces, extra limbs, random outfit changes, unreadable text.

Deterministic anchors (must preserve):
- series_title: ${context.series_title}
- character_visual_signature_tokens: ${context.character_visual_signatures.join(' | ')}
- location_motifs: ${context.location_motifs.join(' | ')}
- target_ratio: ${context.ratio}
- subculture_focus: ${context.subculture_focus}

Grid spec:
- grid_part: ${gridPart}
- time_window_sec: ${startSec}-${endSec}
- use exactly 9 panels.
- panel order should follow time progression.
- keep character design, clothing, and facial traits consistent panel-to-panel.
- ${languageCaptionRule(episode.language_mode)}
- include camera angle/framing variety.
- keep captioning minimal like manga captions.

Episode context:
- episode_no: ${episode.episode_no}
- title: ${episode.title}
- logline: ${episode.logline}

Shots for this grid:
${JSON.stringify(selectedShots)}

Dialogue reference (for caption tone only):
${JSON.stringify(episode.dialogues.slice(0, 16))}
`.trim();
}
