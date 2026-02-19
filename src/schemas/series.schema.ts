import { z } from 'zod';

export const LanguageModeSchema = z.enum(['BM_SABAH', 'SULUK', 'BAJAU', 'HYBRID']);
export const RatioSchema = z.enum(['16:9', '9:16']);
export const PlatformSchema = z.enum(['YOUTUBE', 'FACEBOOK']);

export const CharacterRoleSchema = z.enum(['hero', 'mentor', 'villain', 'support']);

export const SeriesCharacterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: CharacterRoleSchema,
  short_bio: z.string().min(1),
  visual_signature: z.string().min(1),
  speech_style: z.string().min(1)
});

export const SeriesWorldSchema = z.object({
  location: z.literal('Sabah'),
  subculture_focus: z.string().min(1),
  recurring_motifs: z.array(z.string().min(1))
});

export const SeriesInputSchema = z.object({
  series_title: z.string().min(1),
  theme: z.string().min(1),
  core_conflict: z.string().min(1),
  episode_count: z.number().int().positive(),
  primary_language: z.literal('BM_SABAH'),
  language_mode: LanguageModeSchema,
  ratio: RatioSchema,
  platform: PlatformSchema.optional(),
  style_mode: z.literal('LOCAL_X_ANIME'),
  style_variant: z.string().min(1).optional(),
  genre_tags: z.array(z.string().min(1)).default([]),
  story_outline: z.string().min(1).optional(),
  world: SeriesWorldSchema,
  characters: z.array(SeriesCharacterSchema).min(1),
  episode_duration_sec: z.literal(120),
  grids_per_episode: z.literal(2),
  panels_per_grid: z.literal(9)
});

export type SeriesInput = z.infer<typeof SeriesInputSchema>;
export type AspectRatio = z.infer<typeof RatioSchema>;
export type Platform = z.infer<typeof PlatformSchema>;
