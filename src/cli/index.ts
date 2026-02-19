import { resolve } from 'node:path';
import { readJsonFile } from '../core/json.js';
import { logger } from '../core/logger.js';
import { runEpisodeGeneration } from '../pipeline/runEpisode.js';
import { RatioSchema, SeriesInputSchema } from '../schemas/series.schema.js';
import type { AspectRatio } from '../schemas/series.schema.js';

type Args = {
  command?: string;
  inputPath?: string;
  episodeNo?: number;
  ratioOverride?: AspectRatio;
};

function parseArgs(argv: string[]): Args {
  const [command, ...rest] = argv;
  const args: Args = { command };

  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--input') args.inputPath = rest[i + 1];
    if (rest[i] === '--episode') args.episodeNo = Number(rest[i + 1]);
    if (rest[i] === '--ratio') {
      const parsed = RatioSchema.safeParse(rest[i + 1]);
      if (!parsed.success) {
        throw new Error('Invalid --ratio. Use 16:9 or 9:16.');
      }
      args.ratioOverride = parsed.data;
    }
  }

  return args;
}

function usage(): string {
  return [
    'Usage:',
    '  node dist/cli/index.js gen:ep --episode 1 --input ./series.json --ratio 16:9',
    'or',
    '  npm run dev -- gen:ep --episode 1 --input ./series.json --ratio 9:16'
  ].join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command !== 'gen:ep') {
    throw new Error(`Unknown command.\n${usage()}`);
  }

  const inputPath = args.inputPath;
  const episodeNo = args.episodeNo;
  if (!inputPath || episodeNo === undefined || !Number.isInteger(episodeNo) || episodeNo <= 0) {
    throw new Error(`Missing/invalid required args.\n${usage()}`);
  }

  logger.info('1/7 Reading SeriesInput');
  const series = await readJsonFile(resolve(inputPath), SeriesInputSchema, 'series input');

  const result = await runEpisodeGeneration({
    series,
    episodeNo,
    ratioOverride: args.ratioOverride
  });

  console.log(
    [
      `run_id: ${result.runId}`,
      `title: ${result.output.title}`,
      `overall_score: ${result.output.qc_scores.overall.toFixed(1)}/10`,
      `counts: beats=${result.output.beat_outline.length}, dialogues=${result.output.dialogues.length}, shots=${result.output.shotlist.length}, kling=${result.output.kling_prompts.length}`,
      `output: ${result.outPath}`
    ].join('\n')
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(message);
  process.exit(1);
});
