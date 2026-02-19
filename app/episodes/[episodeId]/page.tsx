import { notFound } from 'next/navigation';
import { prisma } from '../../../lib/prisma';

export default async function EpisodeDetailPage({ params }: { params: Promise<{ episodeId: string }> }) {
  const { episodeId: idRaw } = await params;
  if (!/^\d+$/.test(idRaw)) {
    notFound();
  }

  const episodeId = BigInt(idRaw);

  let episode: any = null;
  let queryError: string | null = null;

  try {
    episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      include: {
        series: { select: { id: true, title: true, ratio: true, languageMode: true, stylePreset: true } },
        panels: {
          orderBy: { panelNumber: 'asc' },
          include: {
            assets: {
              orderBy: { createdAt: 'desc' }
            }
          }
        },
        jobs: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            step: true,
            status: true,
            progress: true,
            error: true,
            retryCount: true,
            updatedAt: true
          }
        }
      }
    });
  } catch (error) {
    queryError = error instanceof Error ? error.message : String(error);
  }

  if (queryError) {
    return (
      <main style={{ padding: 20, fontFamily: 'ui-sans-serif, system-ui' }}>
        <h1>Episode Detail Error</h1>
        <p>
          <a href="/">Back to Wizard</a>
        </p>
        <pre>{queryError}</pre>
      </main>
    );
  }

  if (!episode) {
    notFound();
  }

  return (
    <main style={{ padding: 20, fontFamily: 'ui-sans-serif, system-ui', background: '#f5f7fb', minHeight: '100vh' }}>
      <h1>Episode Detail</h1>
      <p>
        <a
          href={`/?seriesId=${episode.series.id.toString()}&episodeId=${episode.id.toString()}&ep=${episode.epNumber}`}
        >
          Back to Wizard
        </a>
      </p>

      <section style={{ background: '#fff', padding: 12, borderRadius: 12, marginBottom: 12 }}>
        <h2>Meta</h2>
        <div>Series: {episode.series.title} (ID: {episode.series.id.toString()})</div>
        <div>Episode: EP{String(episode.epNumber).padStart(2, '0')} (ID: {episode.id.toString()})</div>
        <div>Status: {episode.status}</div>
        <div>Ratio: {episode.series.ratio} | Language: {episode.series.languageMode} | Style: {episode.series.stylePreset}</div>
      </section>

      <section style={{ background: '#fff', padding: 12, borderRadius: 12, marginBottom: 12 }}>
        <h2>Story Payloads</h2>
        <h3>Outline</h3>
        <pre>{JSON.stringify(episode.outline, null, 2)}</pre>
        <h3>Script 45s</h3>
        <pre>{JSON.stringify(episode.script45s, null, 2)}</pre>
        <h3>Storyboard</h3>
        <pre>{JSON.stringify(episode.storyboard, null, 2)}</pre>
        <h3>Motion Plan</h3>
        <pre>{JSON.stringify(episode.motionPlan, null, 2)}</pre>
        <h3>Audio Plan</h3>
        <pre>{JSON.stringify(episode.audioPlan, null, 2)}</pre>
      </section>

      <section style={{ background: '#fff', padding: 12, borderRadius: 12, marginBottom: 12 }}>
        <h2>Panels ({episode.panels.length})</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Panel</th>
              <th style={{ textAlign: 'left' }}>Status</th>
              <th style={{ textAlign: 'left' }}>Prompt</th>
              <th style={{ textAlign: 'left' }}>Dialogue</th>
              <th style={{ textAlign: 'left' }}>Image URL</th>
              <th style={{ textAlign: 'left' }}>Assets</th>
            </tr>
          </thead>
          <tbody>
            {episode.panels.map((panel: any) => (
              <tr key={panel.id.toString()} style={{ borderTop: '1px solid #e5e7eb' }}>
                <td>{panel.panelNumber}</td>
                <td>{panel.status}</td>
                <td>{panel.prompt ?? '-'}</td>
                <td>{panel.dialogue ?? '-'}</td>
                <td>{panel.imageUrl ? <a href={panel.imageUrl} target="_blank" rel="noreferrer">open</a> : '-'}</td>
                <td>
                  {panel.assets.length === 0
                    ? '-'
                    : panel.assets.map((asset: any) => `${asset.type}#${asset.version}`).join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ background: '#fff', padding: 12, borderRadius: 12 }}>
        <h2>Step Jobs ({episode.jobs.length})</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Job ID</th>
              <th style={{ textAlign: 'left' }}>Step</th>
              <th style={{ textAlign: 'left' }}>Status</th>
              <th style={{ textAlign: 'left' }}>Progress</th>
              <th style={{ textAlign: 'left' }}>Retry</th>
              <th style={{ textAlign: 'left' }}>Error</th>
              <th style={{ textAlign: 'left' }}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {episode.jobs.map((job: any) => (
              <tr key={job.id.toString()} style={{ borderTop: '1px solid #e5e7eb' }}>
                <td>{job.id.toString()}</td>
                <td>{job.step}</td>
                <td>{job.status}</td>
                <td>{job.progress}%</td>
                <td>{job.retryCount}</td>
                <td>{job.error ?? '-'}</td>
                <td>{job.updatedAt.toISOString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
