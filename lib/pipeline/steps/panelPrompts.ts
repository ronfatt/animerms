import { prisma } from '../../prisma';
import type { StepInput } from '../types';

type Beat = {
  t?: [number, number];
  purpose?: string;
  summary?: string;
};

type ScriptDialogue = {
  t_sec?: number;
  line?: string;
  subtitle?: string;
};

type PromptPack = {
  prompt: string;
  negativePrompt: string;
  dialogue: string;
  narration: string;
};

const FRAMINGS = ['WS', 'MS', 'CU', 'MS', 'CU', 'WS', 'MS', 'CU', 'MS', 'CU'] as const;
const ANGLES = ['eye', 'low', 'eye', 'high', 'dutch', 'eye', 'low', 'eye', 'high', 'dutch'] as const;
const MOVES = ['static', 'push_in', 'pan', 'tilt', 'handheld', 'orbit', 'pull_out', 'push_in', 'handheld', 'tilt'] as const;
const FX = ['wind', 'wave spray', 'rain mist', 'dust', 'neon flicker'] as const;
const ACTION_VERBS = [
  'dash',
  'scan',
  'signal',
  'brace',
  'evade',
  'counter',
  'rescue',
  'confront',
  'leap',
  'anchor'
] as const;

function shortPurpose(input: string | undefined): string {
  const value = (input ?? '').toLowerCase();
  if (value.includes('hook')) return 'hook';
  if (value.includes('conflict')) return 'conflict';
  if (value.includes('turning')) return 'turning point';
  if (value.includes('setup')) return 'setup';
  return input?.trim() || 'story beat';
}

function dialogueByPurpose(purpose: string, n: number): string {
  if (purpose === 'hook') return 'Apa jadi ni, cepat!';
  if (purpose === 'conflict') return 'Kita kena lawan sekarang.';
  if (purpose === 'turning point') return 'Ini peluang terakhir kita.';
  if (purpose === 'setup') return 'Tenang dulu, dengar pelan.';
  return `Panel ${n}: kita terus gerak.`;
}

function narrationByPurpose(purpose: string, n: number): string {
  if (purpose === 'hook') return `Panel ${n}: ancaman mula meledak di kampung laut.`;
  if (purpose === 'conflict') return `Panel ${n}: tekanan naik, musuh rapat mendesak.`;
  if (purpose === 'turning point') return `Panel ${n}: keputusan kritikal ubah arah cerita.`;
  if (purpose === 'setup') return `Panel ${n}: watak susun langkah sebelum hentaman.`;
  return `Panel ${n}: progres cerita bergerak ke klimaks.`;
}

function pickFx(n: number): string[] {
  return [FX[(n - 1) % FX.length], FX[n % FX.length]];
}

function buildPrompt(input: {
  n: number;
  panelCount: number;
  epNumber: number;
  ratio: string;
  title: string;
  stylePreset: string;
  languageMode: string;
  beat: Beat | undefined;
  dialogue: ScriptDialogue | undefined;
}): PromptPack {
  const purpose = shortPurpose(input.beat?.purpose);
  const seed = input.epNumber * 17 + input.n;
  const framing = FRAMINGS[seed % FRAMINGS.length];
  const angle = ANGLES[seed % ANGLES.length];
  const movement = MOVES[seed % MOVES.length];
  const actionVerb = ACTION_VERBS[seed % ACTION_VERBS.length];
  const fx = pickFx(input.n).join(', ');

  const ratioInstruction =
    input.ratio === '9:16'
      ? 'Vertical 9:16, subject centered/upper-third, strong foreground-mid-background depth, avoid empty sky.'
      : 'Cinematic 16:9, allow environment storytelling with balanced foreground/midground/background.';

  const prompt = [
    `Panel ${input.n}/${input.panelCount} for episode "${input.title}".`,
    `Beat purpose: ${purpose}.`,
    input.beat?.summary ? `Beat summary: ${input.beat.summary}` : '',
    `[CAMERA] ${framing} ${angle}, ${movement}.`,
    `[ACTION] ${actionVerb} with clear body mechanics and emotional intent.`,
    `[ENV] Sabah coastal village mood; environment fx: ${fx}.`,
    `[STYLE] ${input.stylePreset}, semi-real anime cinematic, consistent character outfit and face.`,
    `[LANGUAGE] tone aligned to ${input.languageMode}, no text rendered in image.`,
    `[RATIO] ${ratioInstruction}.`
  ]
    .filter(Boolean)
    .join(' ');

  const dialogueLine = (input.dialogue?.line ?? input.dialogue?.subtitle ?? '').trim();
  return {
    prompt,
    negativePrompt:
      'deformed face, extra limbs, random outfit changes, unreadable text, tiny subject, flat composition',
    dialogue: dialogueLine || dialogueByPurpose(purpose, input.n),
    narration: input.beat?.summary?.trim() || narrationByPurpose(purpose, input.n)
  };
}

function parseBeats(script45s: unknown): Beat[] {
  if (!script45s || typeof script45s !== 'object') return [];
  const maybe = (script45s as { beats?: unknown }).beats;
  if (!Array.isArray(maybe)) return [];
  return maybe.filter((x) => typeof x === 'object' && !!x) as Beat[];
}

function parseDialogues(script45s: unknown): ScriptDialogue[] {
  if (!script45s || typeof script45s !== 'object') return [];
  const maybe = (script45s as { dialogues?: unknown }).dialogues;
  if (!Array.isArray(maybe)) return [];
  return maybe.filter((x) => typeof x === 'object' && !!x) as ScriptDialogue[];
}

function pickBeat(beats: Beat[], n: number, panelCount: number): Beat | undefined {
  if (beats.length === 0) return undefined;
  const scaled = ((n - 1) / Math.max(1, panelCount - 1)) * beats.length;
  const idx = Math.min(beats.length - 1, Math.floor(scaled));
  return beats[idx];
}

function pickDialogue(dialogues: ScriptDialogue[], n: number, panelCount: number): ScriptDialogue | undefined {
  if (dialogues.length === 0) return undefined;
  const idx = Math.min(dialogues.length - 1, Math.floor(((n - 1) / Math.max(1, panelCount - 1)) * dialogues.length));
  return dialogues[idx];
}

async function resetPanelImageRefs(episodeId: bigint): Promise<void> {
  await prisma.panel.updateMany({
    where: { episodeId },
    data: {
      imageUrl: null,
      status: 'queued'
    }
  });
}

export async function panelPromptsStep(input: StepInput): Promise<{ progress: number; message: string }> {
  const episode = await prisma.episode.findUnique({
    where: { id: input.episodeId },
    include: { series: true }
  });
  if (!episode) {
    throw new Error(`Episode ${input.episodeId.toString()} not found`);
  }

  const fromOutline =
    typeof episode.outline === 'object' && episode.outline && 'panelCount' in episode.outline
      ? Number((episode.outline as { panelCount?: number }).panelCount)
      : undefined;

  const panelCount =
    Number.isInteger(input.panelCount) && input.panelCount
      ? input.panelCount
      : Number.isInteger(fromOutline) && fromOutline
      ? fromOutline
      : 18;

  const beats = parseBeats(episode.script45s);
  const dialogues = parseDialogues(episode.script45s);

  await resetPanelImageRefs(input.episodeId);

  for (let i = 1; i <= panelCount; i++) {
    const p = buildPrompt({
      n: i,
      panelCount,
      epNumber: episode.epNumber,
      ratio: episode.series.ratio,
      title: episode.title ?? `Episode ${episode.epNumber}`,
      stylePreset: episode.series.stylePreset,
      languageMode: episode.series.languageMode,
      beat: pickBeat(beats, i, panelCount),
      dialogue: pickDialogue(dialogues, i, panelCount)
    });

    await prisma.panel.upsert({
      where: {
        episodeId_panelNumber: {
          episodeId: input.episodeId,
          panelNumber: i
        }
      },
      create: {
        episodeId: input.episodeId,
        panelNumber: i,
        prompt: p.prompt,
        negativePrompt: p.negativePrompt,
        dialogue: p.dialogue,
        narration: p.narration,
        imageUrl: null,
        status: 'queued'
      },
      update: {
        prompt: p.prompt,
        negativePrompt: p.negativePrompt,
        dialogue: p.dialogue,
        narration: p.narration,
        imageUrl: null,
        status: 'queued'
      }
    });
  }

  return { progress: 100, message: `panel_prompts upserted ${panelCount} varied storyboard prompts` };
}
