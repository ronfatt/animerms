type KlingInputShot = {
  shot_no: number;
  time_sec_range: [number, number];
  camera: {
    framing: 'WS' | 'MS' | 'CU' | 'ECU';
    angle: 'eye' | 'low' | 'high' | 'dutch';
    movement: 'static' | 'push_in' | 'pull_out' | 'pan' | 'tilt' | 'handheld' | 'orbit';
  };
  action: string;
  emotion: string;
  environment_fx: string[];
};

export type KlingEpisodeInput = {
  title: string;
  logline: string;
  ratio: '16:9' | '9:16';
  platform?: 'YOUTUBE' | 'FACEBOOK';
  character_visual_signatures: string[];
  shotlist: KlingInputShot[];
};

export type KlingPromptItem = {
  shot_no: number;
  duration_sec: number;
  prompt: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toLensVibe(framing: KlingInputShot['camera']['framing']): string {
  if (framing === 'WS') return 'wide cinematic lens vibe';
  if (framing === 'MS') return 'natural 35mm lens vibe';
  if (framing === 'CU') return 'portrait 50mm lens vibe';
  return 'macro dramatic lens vibe';
}

function sanitizeFxList(fx: string[]): string[] {
  const cleaned = fx.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0) return ['wind'];
  return cleaned.slice(0, 3);
}

function ratioFramingCue(ratio: KlingEpisodeInput['ratio']): string {
  if (ratio === '9:16') {
    return [
      '9:16 vertical framing',
      'designed for vertical smartphone viewing',
      'expression-first emotional framing',
      'at least 60% MS/CU framing intent',
      'wide framing not above 25%',
      'subject centered vertically or upper-third',
      'avoid empty sky/sea dead zones',
      'foreground nets/wood poles, mid character, background sea/sky depth',
      'prefer push_in/tilt/handheld movement',
      'emotional CU/ECU cadence every 20-30s',
      'preserve top 10% and bottom 18% safe areas'
    ].join(', ');
  }
  return '16:9 cinematic wide framing, reserve bottom 12-15% subtitle safe area';
}

function platformStyleCue(episode: KlingEpisodeInput): string {
  if (episode.ratio === '9:16' && episode.platform === 'FACEBOOK') {
    return [
      'Facebook 9:16 style cue',
      'semi-real anime over heavy stylized anime',
      'realistic skin tones',
      'local texture realism: humid air, sea wind, rain particles, cloth texture detail'
    ].join(', ');
  }
  return 'style cue: standard LOCAL_X_ANIME semi-real cinematic finish';
}

export function buildKlingPrompts(episode: KlingEpisodeInput): KlingPromptItem[] {
  const consistencyTokens = episode.character_visual_signatures.join(' | ');
  const framingCue = ratioFramingCue(episode.ratio);
  const styleCue = platformStyleCue(episode);

  return episode.shotlist.map((shot) => {
    const rawDuration = shot.time_sec_range[1] - shot.time_sec_range[0];
    const durationSec = clamp(Number(rawDuration.toFixed(2)), 4, 8);
    const lensVibe = toLensVibe(shot.camera.framing);
    const environmentFx = sanitizeFxList(shot.environment_fx).join(', ');

    const prompt = [
      episode.ratio === '9:16' ? 'Vertical cinematic anime shot, 9:16.' : 'Cinematic anime shot, 16:9.',
      `[SCENE] Sabah coastal setting with local motifs, episode "${episode.title}".`,
      `[ACTION] Character performs clear action verb: ${shot.action}.`,
      episode.ratio === '9:16'
        ? '[CAMERA] slow push-in / subtle handheld / slight tilt.'
        : `[CAMERA] ${shot.camera.movement}, ${shot.camera.framing} ${shot.camera.angle}, ${lensVibe}.`,
      '[FOCUS] emotional facial detail or upper body.',
      '[DEPTH] foreground object slightly blurred, background sea/sky.',
      `[FX] ${environmentFx}.`,
      `[STYLE] LOCAL_X_ANIME, semi-real anime, cinematic lighting, consistent outfit and face, ${styleCue}, tokens: ${consistencyTokens}.`,
      `[COMPOSITION] foreground/midground/background parallax cues, emotion: ${shot.emotion}.`,
      `[RATIO] ${framingCue}.`,
      '[NEGATIVE] static pose, tiny subject, empty sky dominance, extra limbs, warped face, random costume, unreadable text, flicker artifacts.'
    ].join(' ');

    return {
      shot_no: shot.shot_no,
      duration_sec: durationSec,
      prompt
    };
  });
}
