import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { config } from '../core/config.js';
import { writeJsonFile } from '../core/json.js';
import { logger } from '../core/logger.js';
import { buildPlatformComplianceInstructions, buildRatioComplianceInstructions } from './ratioRules.js';
import { scoreEpisodeOutputDraft, shouldRefineFromQc } from './scoreAndRefine.js';
import { buildGeminiGridPrompt } from '../prompts/gemini_grid.js';
import { buildKlingPrompts } from '../prompts/kling_shots.js';
import { SYSTEM_JSON_ONLY } from '../prompts/system.js';
import { buildStoryPrompt, buildStoryPromptWithMemory } from '../prompts/story.js';
import { buildStoryboardPrompt } from '../prompts/storyboard.js';
import { generateGeminiImage } from '../providers/gemini.js';
import { generateOpenAiJson } from '../providers/openai.js';
import { EpisodeOutputSchema, StoryOutputSchema } from '../schemas/episode.schema.js';
import type { EpisodeOutput } from '../schemas/episode.schema.js';
import type { AspectRatio, SeriesInput } from '../schemas/series.schema.js';

export type EpisodeRunOptions = {
  series: SeriesInput;
  episodeNo: number;
  ratioOverride?: AspectRatio;
  renderImages?: boolean;
  continuityMemory?: {
    bible?: string;
    state?: string;
    recentEpisodes?: string;
  };
};

export type EpisodeRunResult = {
  runId: string;
  outPath: string;
  output: EpisodeOutput;
  storyboardImages?: Array<{
    part: 'A' | 'B';
    mimeType: string;
    base64Data: string;
  }>;
  panelDialogues?: Array<{
    panel: number;
    shot_no: number;
    time_sec_range: [number, number];
    dialogue: string;
    subtitle: string;
  }>;
};

function buildEpisodeContext(series: SeriesInput, episodeOutput: EpisodeOutput) {
  return {
    episode_no: episodeOutput.episode_no,
    title: episodeOutput.title,
    logline: episodeOutput.logline,
    language_mode: series.language_mode,
    shotlist: episodeOutput.shotlist,
    dialogues: episodeOutput.dialogues.map((dialogue) => ({
      t_sec: dialogue.t_sec,
      line: dialogue.line,
      subtitle: dialogue.subtitle
    }))
  };
}

function buildSafeAreaNotes(ratio: AspectRatio): string[] {
  if (ratio === '9:16') {
    return [
      'Keep subtitles inside bottom 18% safe zone.',
      'Avoid placing character face within bottom 15%.',
      'Keep title or dramatic text inside upper 10-20% only.',
      'Avoid cropping hands or chin too close to frame edges.'
    ];
  }
  return [
    '16:9 safe area: reserve bottom 12-15% height for subtitle placement.',
    'Use WS/MS establishing space for worldbuilding: coastline, village panorama, storm clouds.',
    'Avoid placing text over faces, hands, and focal action beats.'
  ];
}

function enrichEpisodeOutput(series: SeriesInput, episodeOutput: EpisodeOutput): EpisodeOutput {
  const episodeContext = buildEpisodeContext(series, episodeOutput);
  const promptContext = {
    series_title: series.series_title,
    character_visual_signatures: series.characters.map((character) => character.visual_signature),
    location_motifs: series.world.recurring_motifs,
    ratio: series.ratio,
    subculture_focus: series.world.subculture_focus,
    platform: series.platform
  };

  const geminiPromptA = buildGeminiGridPrompt(episodeContext, 'A', promptContext);
  const geminiPromptB = buildGeminiGridPrompt(episodeContext, 'B', promptContext);

  const klingPrompts = buildKlingPrompts({
    title: episodeOutput.title,
    logline: episodeOutput.logline,
    ratio: series.ratio,
    platform: series.platform,
    character_visual_signatures: promptContext.character_visual_signatures,
    shotlist: episodeOutput.shotlist
  });

  return EpisodeOutputSchema.parse({
    ...episodeOutput,
    ratio: series.ratio,
    gemini_prompts: {
      gridA: geminiPromptA,
      gridB: geminiPromptB
    },
    kling_prompts: klingPrompts,
    safe_area_notes:
      episodeOutput.safe_area_notes.length > 0 ? episodeOutput.safe_area_notes : buildSafeAreaNotes(series.ratio)
  });
}

async function timed<T>(runId: string, label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  logger.info(`[run:${runId}] ${label} started`);
  const result = await fn();
  logger.info(`[run:${runId}] ${label} finished in ${Date.now() - start}ms`);
  return result;
}

function buildPanelDialogues(output: EpisodeOutput): EpisodeRunResult['panelDialogues'] {
  const sortedShots = output.shotlist.slice().sort((a, b) => a.shot_no - b.shot_no).slice(0, 18);
  return sortedShots.map((shot, idx) => {
    const mid = (shot.time_sec_range[0] + shot.time_sec_range[1]) / 2;
    const nearest =
      output.dialogues
        .slice()
        .sort((a, b) => Math.abs(a.t_sec - mid) - Math.abs(b.t_sec - mid))[0] ?? null;
    return {
      panel: idx + 1,
      shot_no: shot.shot_no,
      time_sec_range: shot.time_sec_range,
      dialogue: nearest?.line ?? '',
      subtitle: nearest?.subtitle ?? ''
    };
  });
}

export async function runEpisodeGeneration(options: EpisodeRunOptions): Promise<EpisodeRunResult> {
  const runId = randomUUID().slice(0, 8);
  const resolvedRatio = options.ratioOverride ?? config.RATIO_OVERRIDE ?? options.series.ratio;
  const series: SeriesInput = { ...options.series, ratio: resolvedRatio };

  const story = await timed(runId, '2/7 OpenAI story call', async () => {
    const storyUserPrompt = options.continuityMemory
      ? buildStoryPromptWithMemory(series, options.episodeNo, options.continuityMemory)
      : buildStoryPrompt(series, options.episodeNo);
    return generateOpenAiJson({
      schema: StoryOutputSchema,
      system: SYSTEM_JSON_ONLY,
      user: storyUserPrompt,
      label: 'story output'
    });
  });

  let episodeOutput = await timed(runId, '3/7 OpenAI storyboard call', async () => {
    return generateOpenAiJson({
      schema: EpisodeOutputSchema,
      system: SYSTEM_JSON_ONLY,
      user: buildStoryboardPrompt(story, {
        ratio: series.ratio,
        primaryLanguage: series.primary_language,
        languageMode: series.language_mode,
        subcultureFocus: series.world.subculture_focus,
        platform: series.platform
      }),
      label: 'episode output draft'
    });
  });

  episodeOutput = await timed(runId, '4/7 Build Gemini prompts + 5/7 Build Kling prompts', async () => {
    return enrichEpisodeOutput(series, episodeOutput);
  });

  let score = await timed(runId, '6/7 QC score', async () => scoreEpisodeOutputDraft(episodeOutput));
  const ratioRuleInstructions = buildRatioComplianceInstructions(episodeOutput);
  const platformRuleInstructions = buildPlatformComplianceInstructions(episodeOutput, series.platform);

  episodeOutput = EpisodeOutputSchema.parse({
    ...episodeOutput,
    qc_scores: score.qc_scores
  });

  if (shouldRefineFromQc(score) || ratioRuleInstructions.length > 0 || platformRuleInstructions.length > 0) {
    const reviseInstructions = Array.from(
      new Set([...(score.revise_instructions ?? []), ...ratioRuleInstructions, ...platformRuleInstructions])
    );

    episodeOutput = await timed(runId, '6b/7 Refinement pass', async () => {
      const refined = await generateOpenAiJson({
        schema: EpisodeOutputSchema,
        system: SYSTEM_JSON_ONLY,
        user: buildStoryboardPrompt(story, {
          reviseInstructions,
          ratio: series.ratio,
          primaryLanguage: series.primary_language,
          languageMode: series.language_mode,
          subcultureFocus: series.world.subculture_focus,
          platform: series.platform
        }),
        label: 'refined episode output'
      });
      return enrichEpisodeOutput(series, refined);
    });

    score = await timed(runId, '6c/7 QC score after refine', async () => scoreEpisodeOutputDraft(episodeOutput));
    episodeOutput = EpisodeOutputSchema.parse({
      ...episodeOutput,
      qc_scores: score.qc_scores
    });
  }

  const filename = `EP${String(options.episodeNo).padStart(2, '0')}.json`;
  const outPath = join(config.OUT_DIR, filename);
  await timed(runId, '7/7 Write output', async () => {
    await writeJsonFile(outPath, episodeOutput);
    return undefined;
  });

  let storyboardImages: EpisodeRunResult['storyboardImages'];
  let panelDialogues: EpisodeRunResult['panelDialogues'];
  if (options.renderImages) {
    const imageA = await timed(runId, '8/9 Gemini image grid A', async () =>
      generateGeminiImage(episodeOutput.gemini_prompts.gridA, `ep${options.episodeNo}-gridA`)
    );
    const imageB = await timed(runId, '9/9 Gemini image grid B', async () =>
      generateGeminiImage(episodeOutput.gemini_prompts.gridB, `ep${options.episodeNo}-gridB`)
    );
    storyboardImages = [
      { part: 'A', mimeType: imageA.mimeType, base64Data: imageA.base64Data },
      { part: 'B', mimeType: imageB.mimeType, base64Data: imageB.base64Data }
    ];
    panelDialogues = buildPanelDialogues(episodeOutput);
  }

  return { runId, outPath, output: episodeOutput, storyboardImages, panelDialogues };
}
