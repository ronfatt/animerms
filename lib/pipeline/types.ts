export const PIPELINE_STEPS = [
  'director_plan',
  'script_45s',
  'panel_prompts',
  'gemini_storyboard',
  'motion_plan',
  'audio_plan'
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export type StepInput = {
  seriesId: bigint;
  episodeId: bigint;
  panelCount?: number;
};

export function isPipelineStep(value: string): value is PipelineStep {
  return PIPELINE_STEPS.includes(value as PipelineStep);
}
