import type { EpisodeOutput } from '../schemas/episode.schema.js';
import type { Platform } from '../schemas/series.schema.js';

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function buildRatioComplianceInstructions(episode: EpisodeOutput): string[] {
  if (episode.ratio !== '9:16') {
    return [];
  }

  const instructions: string[] = [];
  const totalShots = Math.max(episode.shotlist.length, 1);
  const mediumCloseShots = episode.shotlist.filter(
    (shot) => shot.camera.framing === 'MS' || shot.camera.framing === 'CU'
  ).length;
  const wideShots = episode.shotlist.filter((shot) => shot.camera.framing === 'WS').length;

  const mediumCloseRatio = mediumCloseShots / totalShots;
  const wideRatio = wideShots / totalShots;

  if (mediumCloseRatio < 0.6) {
    instructions.push(
      `9:16 rule: at least 60% shots must be MS/CU. Current is ${percent(mediumCloseRatio)}. Increase MS/CU coverage.`
    );
  }

  if (wideRatio > 0.25) {
    instructions.push(
      `9:16 rule: wide shots cannot exceed 25%. Current is ${percent(wideRatio)}. Reduce WS shots.`
    );
  }

  const preferredMoves = episode.shotlist.filter((shot) =>
    ['push_in', 'tilt', 'handheld'].includes(shot.camera.movement)
  ).length;
  const preferredMoveRatio = preferredMoves / totalShots;
  if (preferredMoveRatio < 0.5) {
    instructions.push(
      `9:16 rule: use push_in/tilt/handheld more frequently. Current preferred movement ratio is ${percent(preferredMoveRatio)}; target at least 50%.`
    );
  }

  const placementViolations = episode.shotlist
    .filter((shot) => !/(upper[- ]third|center(?:ed)? vertically|subject centered)/i.test(shot.composition_notes))
    .map((shot) => shot.shot_no);

  if (placementViolations.length > 0) {
    instructions.push(
      `9:16 rule: every shot must center subject vertically or use upper-third framing. Fix composition_notes for shots: ${placementViolations.join(', ')}.`
    );
  }

  const verticalDepthViolations = episode.shotlist
    .filter(
      (shot) =>
        !/(foreground|midground|background)/i.test(shot.composition_notes) ||
        !/(net|pole|wood|sea|sky)/i.test(shot.composition_notes)
    )
    .map((shot) => shot.shot_no);
  if (verticalDepthViolations.length > 0) {
    instructions.push(
      `9:16 rule: build vertical depth (foreground nets/wooden poles, mid character, background sea/sky). Improve composition_notes for shots: ${verticalDepthViolations.join(', ')}.`
    );
  }

  // Require at least one CU/ECU emotional close-up in every 30-second window.
  const closeupWindows: Array<[number, number]> = [
    [0, 30],
    [30, 60],
    [60, 90],
    [90, 120]
  ];
  const missingCloseupWindows = closeupWindows.filter(([start, end]) => {
    return !episode.shotlist.some(
      (shot) =>
        (shot.camera.framing === 'CU' || shot.camera.framing === 'ECU') &&
        shot.time_sec_range[0] < end &&
        shot.time_sec_range[1] > start
    );
  });
  if (missingCloseupWindows.length > 0) {
    instructions.push(
      `9:16 rule: include emotional close-ups (CU/ECU) at least every 20-30 seconds. Missing windows: ${missingCloseupWindows.map(([s, e]) => `${s}-${e}s`).join(', ')}.`
    );
  }

  const safeAreaText = episode.safe_area_notes.join(' ').toLowerCase();
  if (!safeAreaText.includes('top 10%') || !safeAreaText.includes('bottom 18%')) {
    instructions.push(
      '9:16 rule: safe_area_notes must explicitly reserve top 10% (no important visual) and bottom 18% (subtitle zone).'
    );
  }

  instructions.push('9:16 rule: avoid excessive empty sky or sea areas in composition framing.');
  instructions.push('9:16 rule: design for vertical smartphone viewing and emphasize character expressions/emotional beats.');

  return Array.from(new Set(instructions));
}

export function buildPlatformComplianceInstructions(
  episode: EpisodeOutput,
  platform?: Platform
): string[] {
  if (platform !== 'YOUTUBE' && platform !== 'FACEBOOK') {
    return [];
  }

  const instructions: string[] = [];
  const firstShot = episode.shotlist[0];
  const firstDialogueTime = episode.dialogues.reduce(
    (min, line) => Math.min(min, line.t_sec),
    Number.POSITIVE_INFINITY
  );

  if (firstDialogueTime > 5) {
    instructions.push(
      `Platform ${platform}: first dialogue must appear within 5 seconds (current first dialogue at ${Number.isFinite(firstDialogueTime) ? `${firstDialogueTime}s` : 'none'}).`
    );
  }

  if (firstShot) {
    const firstShotText = `${firstShot.action} ${firstShot.emotion}`.toLowerCase();
    const conflictPattern = /(fight|attack|chase|escape|argue|panic|cry|rage|fear|shock|storm|danger|conflict|confront)/i;
    if (!conflictPattern.test(firstShotText)) {
      instructions.push(
        `Platform ${platform}: first shot must show visible conflict or emotional intensity. Strengthen shot 1 action/emotion.`
      );
    }

    const slowIntroPattern = /(establishing|landscape|panorama|slow reveal|sunrise|environment|scenery)/i;
    if (slowIntroPattern.test(firstShotText)) {
      instructions.push(`Platform ${platform}: avoid slow environmental intro in first shot.`);
    }
  }

  const narrationPattern = /(narator|narrator|voiceover|pada suatu hari|once upon)/i;
  const firstDialogue = episode.dialogues
    .slice()
    .sort((a, b) => a.t_sec - b.t_sec)[0];
  if (firstDialogue && narrationPattern.test(firstDialogue.line)) {
    instructions.push(`Platform ${platform}: avoid pure narration intro in first dialogue.`);
  }

  return Array.from(new Set(instructions));
}
