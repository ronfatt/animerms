import { join } from 'node:path';
import { config } from '../core/config.js';
import { writeJsonFile } from '../core/json.js';
import { logger } from '../core/logger.js';
import { buildPlatformComplianceInstructions, buildRatioComplianceInstructions } from '../pipeline/ratioRules.js';
import { SYSTEM_JSON_ONLY } from '../prompts/system.js';
import { buildGeminiGridPrompt } from '../prompts/gemini_grid.js';
import { buildKlingPrompts } from '../prompts/kling_shots.js';
import { buildStoryPrompt } from '../prompts/story.js';
import { buildStoryboardPrompt } from '../prompts/storyboard.js';
import { generateGeminiJson } from '../providers/gemini.js';
import { generateOpenAiJson } from '../providers/openai.js';
import {
  EpisodeAssetsSchema,
  EpisodeOutputSchema,
  GeminiGridOutputSchema,
  KlingShotsOutputSchema,
  StoryOutputSchema
} from '../schemas/episode.schema.js';
import type { EpisodeAssets, EpisodeInput, EpisodeOutput } from '../schemas/episode.schema.js';
import type { SeriesInput } from '../schemas/series.schema.js';
import {
  regenerateEpisodeOutputFromStoryboard,
  scoreEpisodeOutputDraft,
  shouldRefineFromQc
} from './scoreAndRefine.js';

function buildGeminiPromptInput(series: SeriesInput, episodeOutput: EpisodeOutput) {
  return {
    episodeData: {
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
    },
    context: {
      series_title: series.series_title,
      character_visual_signatures: series.characters.map((character) => character.visual_signature),
      location_motifs: series.world.recurring_motifs,
      ratio: series.ratio,
      subculture_focus: series.world.subculture_focus,
      platform: series.platform
    }
  };
}

function mapEpisodeOutputToStoryboard(episodeOutput: EpisodeOutput) {
  return {
    layoutStyle: 'episode-output-derived',
    panels: episodeOutput.shotlist.map((shot) => ({
      panelNumber: shot.shot_no,
      sceneNumber: 1,
      shotType: `${shot.camera.framing}_${shot.camera.angle}_${shot.camera.movement}`,
      visualDescription: `${shot.action} | emotion: ${shot.emotion} | ${shot.composition_notes}`,
      dialogue: undefined,
      sfx: shot.environment_fx.join(', ')
    }))
  };
}

function buildSafeAreaNotes(ratio: SeriesInput['ratio']): string[] {
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

export async function generateEpisodeAssets(
  series: SeriesInput,
  episode: EpisodeInput
): Promise<EpisodeAssets> {
  logger.info(`Generating story for episode ${episode.episodeNumber}`);
  const story = await generateOpenAiJson({
    schema: StoryOutputSchema,
    system: SYSTEM_JSON_ONLY,
    user: buildStoryPrompt(series, episode),
    label: 'story output'
  });

  logger.info('Generating EpisodeOutput draft from storyboard prompt');
  let episodeOutput = await generateOpenAiJson({
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
  episodeOutput = EpisodeOutputSchema.parse({
    ...episodeOutput,
    ratio: series.ratio,
    safe_area_notes:
      episodeOutput.safe_area_notes.length > 0 ? episodeOutput.safe_area_notes : buildSafeAreaNotes(series.ratio)
  });

  logger.info('Running QC scoring pass 1/2');
  let score = await scoreEpisodeOutputDraft(episodeOutput);
  const ratioRuleInstructions = buildRatioComplianceInstructions(episodeOutput);
  const platformRuleInstructions = buildPlatformComplianceInstructions(episodeOutput, series.platform);

  if (shouldRefineFromQc(score) || ratioRuleInstructions.length > 0 || platformRuleInstructions.length > 0) {
    logger.info('QC below threshold, running refinement pass 2/2 (storyboard-only)');
    const reviseInstructions = Array.from(
      new Set([...(score.revise_instructions ?? []), ...ratioRuleInstructions, ...platformRuleInstructions])
    );
    episodeOutput = await regenerateEpisodeOutputFromStoryboard(story, reviseInstructions, {
      ratio: series.ratio,
      primaryLanguage: series.primary_language,
      languageMode: series.language_mode,
      subcultureFocus: series.world.subculture_focus,
      platform: series.platform
    });
    episodeOutput = EpisodeOutputSchema.parse({
      ...episodeOutput,
      ratio: series.ratio,
      safe_area_notes:
        episodeOutput.safe_area_notes.length > 0
          ? episodeOutput.safe_area_notes
          : buildSafeAreaNotes(series.ratio)
    });
    logger.info('Running QC scoring pass 2/2');
    score = await scoreEpisodeOutputDraft(episodeOutput);
  }

  logger.info('Generating Gemini visual grid package');
  const geminiPromptInput = buildGeminiPromptInput(series, episodeOutput);
  const geminiGrid = await generateGeminiJson({
    schema: GeminiGridOutputSchema,
    system: SYSTEM_JSON_ONLY,
    user: buildGeminiGridPrompt(geminiPromptInput.episodeData, 'A', geminiPromptInput.context),
    label: 'gemini grid output'
  });

  logger.info('Generating Kling shots package');
  const klingPrompts = buildKlingPrompts({
    title: episodeOutput.title,
    logline: episodeOutput.logline,
    ratio: series.ratio,
    platform: series.platform,
    character_visual_signatures: geminiPromptInput.context.character_visual_signatures,
    shotlist: episodeOutput.shotlist
  });
  const klingShots = KlingShotsOutputSchema.parse({
    model: 'kling',
    aspectRatio: '16:9',
    shots: klingPrompts.map((item) => ({
      shotId: `shot-${item.shot_no}`,
      panelNumber: item.shot_no,
      prompt: item.prompt,
      durationSec: item.duration_sec
    }))
  });

  const storyboard = mapEpisodeOutputToStoryboard(episodeOutput);

  const assets: EpisodeAssets = {
    seriesId: episode.seriesId,
    episodeNumber: episode.episodeNumber,
    generatedAt: new Date().toISOString(),
    story,
    storyboard,
    geminiGrid,
    klingShots,
    score
  };

  const valid = EpisodeAssetsSchema.parse(assets);
  const outPath = join(config.OUT_DIR, `${episode.seriesId}-ep${episode.episodeNumber}.json`);
  await writeJsonFile(outPath, valid);
  logger.info(`Episode assets written to ${outPath}`);

  return valid;
}
