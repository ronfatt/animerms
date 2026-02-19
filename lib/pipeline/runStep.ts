import type { PipelineStep, StepInput } from './types';
import { directorPlanStep } from './steps/directorPlan';
import { script45sStep } from './steps/script45s';
import { panelPromptsStep } from './steps/panelPrompts';
import { geminiStoryboardStep } from './steps/geminiStoryboard';
import { motionPlanStep } from './steps/motionPlan';
import { audioPlanStep } from './steps/audioPlan';

export async function runPipelineStep(step: PipelineStep, input: StepInput): Promise<{ progress: number; message: string }> {
  switch (step) {
    case 'director_plan':
      return directorPlanStep(input);
    case 'script_45s':
      return script45sStep(input);
    case 'panel_prompts':
      return panelPromptsStep(input);
    case 'gemini_storyboard':
      return geminiStoryboardStep(input);
    case 'motion_plan':
      return motionPlanStep(input);
    case 'audio_plan':
      return audioPlanStep(input);
    default:
      throw new Error(`Unhandled step: ${step}`);
  }
}
