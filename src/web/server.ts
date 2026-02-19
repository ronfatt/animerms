import { createServer } from 'node:http';
import { config } from '../core/config.js';
import { logger } from '../core/logger.js';
import { runEpisodeGeneration } from '../pipeline/runEpisode.js';
import { RatioSchema, SeriesInputSchema } from '../schemas/series.schema.js';

const port = Number(process.env.PORT ?? 5000);

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Comic Pipeline MVP</title>
    <style>
      :root { --bg:#f5f7fb; --card:#ffffff; --text:#102033; --muted:#5b6b80; --accent:#0f766e; }
      body { margin:0; font-family: "IBM Plex Sans", "Segoe UI", sans-serif; background:linear-gradient(180deg,#e8f4ff, #f5f7fb); color:var(--text); }
      .wrap { max-width: 980px; margin: 24px auto; padding: 0 16px; }
      .card { background:var(--card); border-radius:12px; padding:16px; box-shadow:0 8px 30px rgba(16,32,51,0.08); }
      h1 { margin:0 0 12px 0; font-size:22px; }
      p { margin:0 0 12px 0; color:var(--muted); }
      .row { display:grid; grid-template-columns: 1fr 120px 130px auto; gap:10px; align-items:end; margin-bottom:10px; }
      label { font-size:12px; color:var(--muted); display:block; margin-bottom:4px; }
      input, select, textarea, button { width:100%; border:1px solid #c7d2e2; border-radius:8px; padding:10px; font:inherit; }
      textarea { min-height:320px; resize:vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; }
      button { background:var(--accent); color:white; border:none; cursor:pointer; font-weight:600; }
      button:disabled { opacity:.6; cursor:not-allowed; }
      pre { background:#0e1520; color:#d6e3f5; padding:12px; border-radius:8px; overflow:auto; min-height:120px; }
      @media (max-width: 900px) { .row { grid-template-columns:1fr; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>Comic Pipeline MVP</h1>
        <p>Paste SeriesInput JSON and generate episode output.</p>
        <div class="row">
          <div>
            <label>Episode</label>
            <input id="episode" type="number" min="1" value="1" />
          </div>
          <div>
            <label>Ratio</label>
            <select id="ratio"><option value="">Auto</option><option>16:9</option><option>9:16</option></select>
          </div>
          <div>
            <label>Platform</label>
            <select id="platform"><option value="">(from JSON)</option><option>YOUTUBE</option><option>FACEBOOK</option></select>
          </div>
          <button id="run">Generate</button>
        </div>
        <label>SeriesInput JSON</label>
        <textarea id="series"></textarea>
        <p id="status"></p>
        <pre id="result"></pre>
      </div>
    </div>
    <script>
      const runBtn = document.getElementById('run');
      const statusEl = document.getElementById('status');
      const resultEl = document.getElementById('result');
      const seriesEl = document.getElementById('series');

      runBtn.addEventListener('click', async () => {
        runBtn.disabled = true;
        statusEl.textContent = 'Running generation...';
        resultEl.textContent = '';

        try {
          const episodeNo = Number(document.getElementById('episode').value);
          const ratio = document.getElementById('ratio').value || undefined;
          const platform = document.getElementById('platform').value || undefined;
          const series = JSON.parse(seriesEl.value);

          const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ episodeNo, ratio, platform, series })
          });

          const body = await res.json();
          if (!res.ok) {
            throw new Error(body.error || 'Generation failed');
          }

          statusEl.textContent = 'Done';
          resultEl.textContent = JSON.stringify(body, null, 2);
        } catch (err) {
          statusEl.textContent = 'Failed';
          resultEl.textContent = String(err.message || err);
        } finally {
          runBtn.disabled = false;
        }
      });
    </script>
  </body>
</html>`;

function json(res: import('node:http').ServerResponse, code: number, payload: unknown): void {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.statusCode = 200;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(html);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/generate') {
    try {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 1_000_000) {
          json(res, 413, { error: 'Payload too large' });
          return;
        }
      }

      const parsedBody = JSON.parse(raw) as {
        episodeNo?: number;
        ratio?: string;
        platform?: string;
        series?: unknown;
      };

      const episodeNo = parsedBody.episodeNo;
      if (episodeNo === undefined || !Number.isInteger(episodeNo) || episodeNo <= 0) {
        json(res, 400, { error: 'episodeNo must be a positive integer' });
        return;
      }

      const seriesParsed = SeriesInputSchema.safeParse(parsedBody.series);
      if (!seriesParsed.success) {
        json(res, 400, { error: seriesParsed.error.message });
        return;
      }

      const ratioParsed = parsedBody.ratio ? RatioSchema.safeParse(parsedBody.ratio) : { success: true, data: undefined };
      if (!ratioParsed.success) {
        json(res, 400, { error: 'ratio must be 16:9 or 9:16' });
        return;
      }

      const series = seriesParsed.data;
      if (parsedBody.platform === 'YOUTUBE' || parsedBody.platform === 'FACEBOOK') {
        series.platform = parsedBody.platform;
      }

      const result = await runEpisodeGeneration({
        series,
        episodeNo,
        ratioOverride: ratioParsed.data
      });

      json(res, 200, {
        run_id: result.runId,
        output_path: result.outPath,
        title: result.output.title,
        overall_score: result.output.qc_scores.overall,
        counts: {
          beats: result.output.beat_outline.length,
          dialogues: result.output.dialogues.length,
          shots: result.output.shotlist.length,
          kling: result.output.kling_prompts.length
        }
      });
      return;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      json(res, 500, { error: message });
      return;
    }
  }

  json(res, 404, { error: 'Not found' });
});

server.listen(port, () => {
  logger.info(`Web UI running on http://localhost:${port}`);
  logger.info(`Configured output dir: ${config.OUT_DIR}`);
});
