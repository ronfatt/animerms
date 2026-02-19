import { runEpisodeGeneration } from '../dist/pipeline/runEpisode.js';
import { SeriesInputSchema, RatioSchema } from '../dist/schemas/series.schema.js';

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
    const episodeNo = body.episodeNo;
    if (!Number.isInteger(episodeNo) || episodeNo <= 0) {
      res.status(400).json({ error: 'episodeNo must be a positive integer' });
      return;
    }

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

    const series = seriesParsed.data;
    const result = await runEpisodeGeneration({
      series,
      episodeNo,
      ratioOverride: ratioParsed.data,
      renderImages: Boolean(body.renderImages)
    });

    res.status(200).json({
      run_id: result.runId,
      output_path: result.outPath,
      title: result.output.title,
      overall_score: result.output.qc_scores.overall,
      counts: {
        beats: result.output.beat_outline.length,
        dialogues: result.output.dialogues.length,
        shots: result.output.shotlist.length,
        kling: result.output.kling_prompts.length
      },
      storyboard_images: (result.storyboardImages ?? []).map((item) => ({
        part: item.part,
        mime_type: item.mimeType,
        data_url: `data:${item.mimeType};base64,${item.base64Data}`
      })),
      panel_dialogues: result.panelDialogues ?? [],
      used_series: series
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
