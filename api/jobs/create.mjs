import { createSeasonJob } from '../../dist/jobs/service.js';
import { SeriesInputSchema, RatioSchema } from '../../dist/schemas/series.schema.js';

function buildSeriesFromQuickInput(body) {
  const quick = body.quick || {};
  const ratio = body.ratio || '9:16';
  const genreTags = Array.isArray(quick.genreTags) ? quick.genreTags.filter(Boolean) : [];
  const recurring = [
    'stilt houses',
    'sea nomad boats',
    'storm clouds',
    'bioluminescent sea',
    'tribal textile patterns',
    ...genreTags.map((g) => `${g} motif`)
  ];

  return {
    series_title: quick.seriesTitle || 'Untitled Series',
    theme: quick.storyOutline || 'Local hero drama in Sabah.',
    core_conflict: quick.coreConflict || quick.storyOutline || 'Conflict emerges from hidden forces.',
    episode_count:
      Number.isInteger(quick.episodeCount) && quick.episodeCount > 0
        ? Math.min(quick.episodeCount, 30)
        : 10,
    primary_language: 'BM_SABAH',
    language_mode: quick.languageMode || 'BM_SABAH',
    ratio,
    platform: body.platform === 'YOUTUBE' || body.platform === 'FACEBOOK' ? body.platform : undefined,
    style_mode: 'LOCAL_X_ANIME',
    style_variant: quick.styleVariant || 'semi-real anime cinematic',
    genre_tags: genreTags,
    story_outline: quick.storyOutline || undefined,
    world: {
      location: 'Sabah',
      subculture_focus: quick.subcultureFocus || 'Bajau coastal village',
      recurring_motifs: Array.from(new Set(recurring))
    },
    characters: [
      {
        id: 'hero',
        name: 'Ari',
        role: 'hero',
        short_bio: 'Young local fisher with awakening power.',
        visual_signature:
          quick.heroVisualSignature ||
          'tan skin, sharp anime eyes, short messy black hair, Bajau woven sash',
        speech_style: 'BM Sabah casual, short punchy lines, local slang'
      }
    ],
    episode_duration_sec: 120,
    grids_per_episode: 2,
    panels_per_grid: 9
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body ?? {};
    const ratioParsed = body.ratio ? RatioSchema.safeParse(body.ratio) : { success: true, data: undefined };
    if (!ratioParsed.success) {
      res.status(400).json({ error: 'ratio must be 16:9 or 9:16' });
      return;
    }

    const rawSeries = body.mode === 'quick' ? buildSeriesFromQuickInput(body) : body.series;
    const seriesParsed = SeriesInputSchema.safeParse(rawSeries);
    if (!seriesParsed.success) {
      res.status(400).json({ error: seriesParsed.error.message });
      return;
    }

    const startEpisode = Number.isInteger(body.startEpisode) && body.startEpisode > 0 ? body.startEpisode : 1;
    const maxEp = seriesParsed.data.episode_count;
    const endEpisode =
      Number.isInteger(body.endEpisode) && body.endEpisode >= startEpisode
        ? Math.min(body.endEpisode, maxEp)
        : maxEp;

    const created = await createSeasonJob({
      series: seriesParsed.data,
      startEpisode,
      endEpisode,
      ratioOverride: ratioParsed.data
    });

    res.status(200).json(created);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
