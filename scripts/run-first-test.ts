import { prisma } from '../lib/prisma';
import { createEpisodeStepChain } from '../lib/jobs/service';
import { PIPELINE_STEPS } from '../lib/pipeline/types';

async function main() {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');

  const series = await prisma.series.create({
    data: {
      title: `Smoke Series ${stamp}`,
      totalEpisodes: 30,
      languageMode: 'BM_SABAH',
      stylePreset: 'LOCAL_X_ANIME',
      ratio: '9:16',
      seriesBible: {
        source: 'smoke-test',
        createdAt: now.toISOString()
      }
    }
  });

  const episode = await prisma.episode.upsert({
    where: {
      seriesId_epNumber: {
        seriesId: series.id,
        epNumber: 1
      }
    },
    create: {
      seriesId: series.id,
      epNumber: 1,
      title: 'EP01 Smoke',
      status: 'pending',
      outline: { panelCount: 9 }
    },
    update: {}
  });

  const chain = await createEpisodeStepChain({
    seriesId: series.id,
    episodeId: episode.id,
    steps: [...PIPELINE_STEPS],
    panelCount: 9
  });

  console.log('Created seriesId:', series.id.toString());
  console.log('Created episodeId:', episode.id.toString());
  console.log('Job IDs:', chain.jobIds.join(', '));

  const start = Date.now();
  const timeoutMs = 180000;

  while (Date.now() - start < timeoutMs) {
    const jobs = await prisma.job.findMany({
      where: {
        id: { in: chain.jobIds.map((id) => BigInt(id)) }
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, step: true, status: true, progress: true, error: true, retryCount: true }
    });

    const summary = jobs.map((j) => `${j.step}:${j.status}:${j.progress}%`).join(' | ');
    console.log(summary);

    const hasFailed = jobs.some((j) => j.status === 'failed');
    const allDone = jobs.length === chain.jobIds.length && jobs.every((j) => j.status === 'done');

    if (hasFailed || allDone) {
      console.log(allDone ? 'ALL_DONE' : 'HAS_FAILED');
      if (hasFailed) {
        for (const j of jobs) {
          if (j.status === 'failed') {
            console.log(`FAILED ${j.step}:`, j.error ?? 'unknown');
          }
        }
      }
      break;
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  const ep = await prisma.episode.findUnique({
    where: { id: episode.id },
    include: {
      panels: {
        select: { id: true, panelNumber: true, status: true, imageUrl: true },
        orderBy: { panelNumber: 'asc' }
      }
    }
  });

  console.log('Episode final status:', ep?.status);
  console.log('Panels:', ep?.panels.length ?? 0);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
