import { z } from 'zod';
import { RatioSchema } from './series.schema.js';

export const TimeSecRangeSchema = z
  .tuple([z.number().nonnegative(), z.number().nonnegative()])
  .refine(([start, end]) => end >= start, {
    message: 'time_sec_range end must be >= start'
  });

export const EpisodeInputSchema = z.object({
  seriesId: z.string().min(1),
  episodeNumber: z.number().int().positive(),
  titleHint: z.string().min(1),
  premise: z.string().min(1),
  keyBeats: z.array(z.string().min(1)).min(1),
  continuityNotes: z.array(z.string().min(1)).default([])
});

export const StorySceneSchema = z.object({
  sceneNumber: z.number().int().positive(),
  location: z.string().min(1),
  summary: z.string().min(1),
  dialogueBeats: z.array(z.string().min(1)).min(1)
});

export const StoryOutputSchema = z.object({
  episodeTitle: z.string().min(1),
  logline: z.string().min(1),
  synopsis: z.string().min(1),
  scenes: z.array(StorySceneSchema).min(1)
});

export const StoryboardPanelSchema = z.object({
  panelNumber: z.number().int().positive(),
  sceneNumber: z.number().int().positive(),
  shotType: z.string().min(1),
  visualDescription: z.string().min(1),
  dialogue: z.string().optional(),
  sfx: z.string().optional()
});

export const StoryboardOutputSchema = z.object({
  layoutStyle: z.string().min(1),
  panels: z.array(StoryboardPanelSchema).min(1)
});

export const GeminiGridOutputSchema = z.object({
  model: z.literal('gemini'),
  renderStyle: z.string().min(1),
  gridPrompt: z.string().min(1),
  negativePrompt: z.string().min(1).optional(),
  styleTokens: z.array(z.string().min(1)).min(1)
});

export const KlingShotSchema = z.object({
  shotId: z.string().min(1),
  panelNumber: z.number().int().positive(),
  prompt: z.string().min(1),
  durationSec: z.number().positive(),
  cameraMove: z.string().optional()
});

export const KlingShotsOutputSchema = z.object({
  model: z.literal('kling'),
  aspectRatio: z.string().min(1),
  shots: z.array(KlingShotSchema).min(1)
});

export const EpisodeScoreSchema = z.object({
  score: z.number().min(0).max(100),
  strengths: z.array(z.string().min(1)).min(1),
  issues: z.array(z.string().min(1)).default([]),
  shouldRefine: z.boolean(),
  refinementPrompt: z.string().optional()
});

export const EpisodeBeatSchema = z.object({
  beat_no: z.number().int().positive(),
  purpose: z.string().min(1),
  time_sec_range: TimeSecRangeSchema,
  summary: z.string().min(1)
});

export const EpisodeDialogueSchema = z.object({
  t_sec: z.number().nonnegative(),
  character_id: z.string().min(1),
  line: z.string().min(1),
  subtitle: z.string().min(1)
});

export const CameraFramingSchema = z.enum(['WS', 'MS', 'CU', 'ECU']);
export const CameraAngleSchema = z.enum(['eye', 'low', 'high', 'dutch']);
export const CameraMovementSchema = z.enum([
  'static',
  'push_in',
  'pull_out',
  'pan',
  'tilt',
  'handheld',
  'orbit'
]);

export const EpisodeShotSchema = z.object({
  shot_no: z.number().int().positive(),
  time_sec_range: TimeSecRangeSchema,
  camera: z.object({
    framing: CameraFramingSchema,
    angle: CameraAngleSchema,
    movement: CameraMovementSchema
  }),
  action: z.string().min(1),
  emotion: z.string().min(1),
  environment_fx: z.array(z.string().min(1)),
  composition_notes: z.string().min(1)
});

export const EpisodeGeminiPromptsSchema = z.object({
  gridA: z.string().min(1),
  gridB: z.string().min(1)
});

export const EpisodeKlingPromptSchema = z.object({
  shot_no: z.number().int().positive(),
  duration_sec: z.number().positive(),
  prompt: z.string().min(1)
});

export const EngagementHookSchema = z.object({
  question: z.string().min(1),
  pin_comment_suggestion: z.string().min(1)
});

export const QcScoresSchema = z.object({
  narrative_clarity: z.number().min(0).max(10),
  local_language_naturalness: z.number().min(0).max(10),
  visual_animatability: z.number().min(0).max(10),
  consistency: z.number().min(0).max(10),
  overall: z.number().min(0).max(10)
});

export const EpisodeOutputSchema = z.object({
  episode_no: z.number().int().positive(),
  ratio: RatioSchema,
  title: z.string().min(1),
  logline: z.string().min(1),
  beat_outline: z.array(EpisodeBeatSchema).min(1),
  dialogues: z.array(EpisodeDialogueSchema).min(1),
  shotlist: z.array(EpisodeShotSchema).min(1),
  gemini_prompts: EpisodeGeminiPromptsSchema,
  kling_prompts: z.array(EpisodeKlingPromptSchema).min(1),
  engagement_hook: EngagementHookSchema.default({
    question: 'Kalau kau jadi Ari, kau lawan atau lari?',
    pin_comment_suggestion: 'EP seterusnya lagi ganas. Kau team siapa?'
  }),
  safe_area_notes: z.array(z.string().min(1)),
  edit_notes: z.array(z.string().min(1)),
  qc_scores: QcScoresSchema
});

export const ScoringOutputSchema = z.object({
  qc_scores: QcScoresSchema,
  comments: z.array(z.string().min(1)).min(1),
  revise_instructions: z.array(z.string().min(1)).min(1)
});

export const EpisodeAssetsSchema = z.object({
  seriesId: z.string().min(1),
  episodeNumber: z.number().int().positive(),
  generatedAt: z.string().min(1),
  story: StoryOutputSchema,
  storyboard: StoryboardOutputSchema,
  geminiGrid: GeminiGridOutputSchema,
  klingShots: KlingShotsOutputSchema,
  score: ScoringOutputSchema.optional()
});

export type EpisodeInput = z.infer<typeof EpisodeInputSchema>;
export type StoryOutput = z.infer<typeof StoryOutputSchema>;
export type StoryboardOutput = z.infer<typeof StoryboardOutputSchema>;
export type GeminiGridOutput = z.infer<typeof GeminiGridOutputSchema>;
export type KlingShotsOutput = z.infer<typeof KlingShotsOutputSchema>;
export type EpisodeAssets = z.infer<typeof EpisodeAssetsSchema>;
export type EpisodeScore = z.infer<typeof EpisodeScoreSchema>;
export type EpisodeOutput = z.infer<typeof EpisodeOutputSchema>;
export type ScoringOutput = z.infer<typeof ScoringOutputSchema>;
