'use client';

import { useEffect, useMemo, useState } from 'react';

type StepKey =
  | 'director_plan'
  | 'script_45s'
  | 'panel_prompts'
  | 'gemini_storyboard'
  | 'motion_plan'
  | 'audio_plan';

const STEP_ORDER: Array<{ key: StepKey; label: string }> = [
  { key: 'director_plan', label: '1) Generate Director Plan' },
  { key: 'script_45s', label: '2) Generate 45s Script' },
  { key: 'panel_prompts', label: '3) Generate Panel Prompts' },
  { key: 'gemini_storyboard', label: '4) Generate Gemini Storyboard' },
  { key: 'motion_plan', label: '5) Generate Motion Plan' },
  { key: 'audio_plan', label: '6) Generate Audio Plan' }
];

type StepStatus = {
  jobId?: string;
  status: string;
  progress: number;
  error?: string | null;
  logs?: unknown;
};

type EpisodeJob = {
  id: string;
  step: StepKey;
  status: string;
  progress: number;
  error?: string | null;
  logs?: unknown;
};

export default function Page() {
  const [seriesId, setSeriesId] = useState('');
  const [title, setTitle] = useState('Pahlawan Ombak');
  const [totalEpisodes, setTotalEpisodes] = useState(10);
  const [ratio, setRatio] = useState('9:16');
  const [languageMode, setLanguageMode] = useState('BM_SABAH');
  const [stylePreset, setStylePreset] = useState('LOCAL_X_ANIME');

  const [epNumber, setEpNumber] = useState(1);
  const [episodeId, setEpisodeId] = useState('');
  const [panelCount, setPanelCount] = useState(9);

  const [batchFrom, setBatchFrom] = useState(1);
  const [batchTo, setBatchTo] = useState(3);
  const [batchSteps, setBatchSteps] = useState<StepKey[]>(['script_45s', 'panel_prompts', 'gemini_storyboard']);

  const [stepStatus, setStepStatus] = useState<Record<StepKey, StepStatus>>({
    director_plan: { status: 'idle', progress: 0 },
    script_45s: { status: 'idle', progress: 0 },
    panel_prompts: { status: 'idle', progress: 0 },
    gemini_storyboard: { status: 'idle', progress: 0 },
    motion_plan: { status: 'idle', progress: 0 },
    audio_plan: { status: 'idle', progress: 0 }
  });

  const [episodes, setEpisodes] = useState<Array<{ id: string; epNumber: number; title: string | null; status: string }>>([]);
  const [statusText, setStatusText] = useState('Ready');

  const selectedSteps = useMemo(() => new Set(batchSteps), [batchSteps]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('comic_wizard_state_v1');
      if (raw) {
        const s = JSON.parse(raw) as {
          seriesId?: string;
          title?: string;
          totalEpisodes?: number;
          ratio?: string;
          languageMode?: string;
          stylePreset?: string;
          epNumber?: number;
          episodeId?: string;
          panelCount?: number;
          batchFrom?: number;
          batchTo?: number;
          batchSteps?: StepKey[];
        };
        if (s.seriesId) setSeriesId(s.seriesId);
        if (s.title) setTitle(s.title);
        if (Number.isInteger(s.totalEpisodes)) setTotalEpisodes(Number(s.totalEpisodes));
        if (s.ratio) setRatio(s.ratio);
        if (s.languageMode) setLanguageMode(s.languageMode);
        if (s.stylePreset) setStylePreset(s.stylePreset);
        if (Number.isInteger(s.epNumber)) setEpNumber(Number(s.epNumber));
        if (s.episodeId) setEpisodeId(s.episodeId);
        if (Number.isInteger(s.panelCount)) setPanelCount(Number(s.panelCount));
        if (Number.isInteger(s.batchFrom)) setBatchFrom(Number(s.batchFrom));
        if (Number.isInteger(s.batchTo)) setBatchTo(Number(s.batchTo));
        if (Array.isArray(s.batchSteps) && s.batchSteps.length > 0) setBatchSteps(s.batchSteps);
      }
    } catch {}

    const q = new URLSearchParams(window.location.search);
    const qSeriesId = q.get('seriesId');
    const qEpisodeId = q.get('episodeId');
    const qEp = q.get('ep');
    if (qSeriesId) setSeriesId(qSeriesId);
    if (qEpisodeId) setEpisodeId(qEpisodeId);
    if (qEp && Number.isInteger(Number(qEp))) setEpNumber(Number(qEp));
  }, []);

  useEffect(() => {
    const payload = {
      seriesId,
      title,
      totalEpisodes,
      ratio,
      languageMode,
      stylePreset,
      epNumber,
      episodeId,
      panelCount,
      batchFrom,
      batchTo,
      batchSteps
    };
    localStorage.setItem('comic_wizard_state_v1', JSON.stringify(payload));
  }, [
    seriesId,
    title,
    totalEpisodes,
    ratio,
    languageMode,
    stylePreset,
    epNumber,
    episodeId,
    panelCount,
    batchFrom,
    batchTo,
    batchSteps
  ]);

  useEffect(() => {
    if (!seriesId) return;
    void refreshEpisodes();
  }, [seriesId]);

  useEffect(() => {
    if (!episodeId) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const data = await getJson<{ jobs?: EpisodeJob[] }>(
          `/api/jobs/by-episode?episodeId=${encodeURIComponent(episodeId)}`
        );
        if (cancelled) return;

        const latestByStep = new Map<StepKey, EpisodeJob>();
        for (const job of data.jobs || []) {
          if (!latestByStep.has(job.step)) {
            latestByStep.set(job.step, job);
          }
        }

        setStepStatus((prev) => {
          const next = { ...prev };
          for (const step of STEP_ORDER.map((s) => s.key)) {
            const hit = latestByStep.get(step);
            if (hit) {
              next[step] = {
                jobId: hit.id,
                status: hit.status,
                progress: hit.progress,
                error: hit.error,
                logs: hit.logs
              };
            }
          }
          return next;
        });
      } catch {
        // keep prior UI state on poll errors
      }
    };

    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [episodeId]);

  async function readResponse<T = Record<string, unknown>>(res: Response): Promise<T> {
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    if (contentType.includes('application/json')) {
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(`Invalid JSON response (HTTP ${res.status})`);
      }
    }
    throw new Error(
      `Non-JSON response (HTTP ${res.status}): ${text.slice(0, 180)}`
    );
  }

  function pickErrorMessage(data: unknown, status: number): string {
    if (data && typeof data === 'object' && 'error' in data) {
      const value = (data as { error?: unknown }).error;
      if (typeof value === 'string' && value.trim()) return value;
    }
    return `HTTP ${status}`;
  }

  async function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await readResponse<T>(res);
    if (!res.ok) throw new Error(pickErrorMessage(data, res.status));
    return data;
  }

  async function getJson<T = Record<string, unknown>>(url: string): Promise<T> {
    const res = await fetch(url);
    const data = await readResponse<T>(res);
    if (!res.ok) throw new Error(pickErrorMessage(data, res.status));
    return data;
  }

  async function createSeries() {
    try {
      setStatusText('Creating series...');
      const data = await postJson<{ seriesId: string | number }>('/api/series', {
        title,
        totalEpisodes,
        ratio,
        languageMode,
        stylePreset
      });
      setSeriesId(String(data.seriesId));
      setStatusText(`Series created: ${String(data.seriesId)}`);
    } catch (error) {
      setStatusText(String(error));
    }
  }

  async function ensureEpisode(): Promise<string> {
    if (!seriesId) throw new Error('Please create/select series first');
    const data = await postJson<{ episodeId: string | number }>('/api/episodes', {
      seriesId,
      epNumber,
      title: `Episode ${String(epNumber).padStart(2, '0')}`,
      outline: { panelCount }
    });
    setEpisodeId(String(data.episodeId));
    setStepStatus({
      director_plan: { status: 'idle', progress: 0 },
      script_45s: { status: 'idle', progress: 0 },
      panel_prompts: { status: 'idle', progress: 0 },
      gemini_storyboard: { status: 'idle', progress: 0 },
      motion_plan: { status: 'idle', progress: 0 },
      audio_plan: { status: 'idle', progress: 0 }
    });
    return String(data.episodeId);
  }

  async function pollJob(step: StepKey, jobId: string) {
    const timer = setInterval(async () => {
      try {
        const data = await getJson<{
          status: string;
          progress: number;
          error?: string | null;
          logs?: unknown;
        }>(`/api/jobs/${jobId}`);
        setStepStatus((prev) => ({
          ...prev,
          [step]: {
            jobId,
            status: data.status,
            progress: data.progress,
            error: data.error,
            logs: data.logs
          }
        }));
        if (['done', 'failed'].includes(data.status)) clearInterval(timer);
      } catch {
        clearInterval(timer);
      }
    }, 1500);
  }

  async function runSingleStep(step: StepKey) {
    try {
      setStatusText(`Queueing ${step}...`);
      const epId = episodeId || (await ensureEpisode());
      const data = await postJson<{ jobId: string | number }>('/api/jobs', {
        seriesId,
        episodeId: epId,
        step,
        panelCount
      });
      setStepStatus((prev) => ({
        ...prev,
        [step]: { jobId: String(data.jobId), status: 'queued', progress: 0 }
      }));
      pollJob(step, String(data.jobId));
      setStatusText(`Queued ${step}: ${String(data.jobId)}`);
    } catch (error) {
      setStatusText(String(error));
    }
  }

  async function runBatch() {
    try {
      if (!seriesId) throw new Error('Please create/select series first');
      setStatusText('Queueing batch...');
      const data = await postJson<{ fromEp: number; toEp: number }>(`/api/series/${seriesId}/batch`, {
        fromEp: batchFrom,
        toEp: batchTo,
        steps: batchSteps,
        panelCount
      });
      setStatusText(`Batch queued: EP${data.fromEp}-EP${data.toEp}`);
      await refreshEpisodes();
    } catch (error) {
      setStatusText(String(error));
    }
  }

  async function refreshEpisodes() {
    try {
      if (!seriesId) return;
      const data = await getJson<{ episodes?: Array<{ id: string; epNumber: number; title: string | null; status: string }> }>(
        `/api/episodes/by-series?seriesId=${encodeURIComponent(seriesId)}`
      );
      setEpisodes(data.episodes || []);
    } catch (error) {
      setStatusText(String(error));
    }
  }

  function toggleBatchStep(step: StepKey) {
    setBatchSteps((prev) => (prev.includes(step) ? prev.filter((s) => s !== step) : [...prev, step]));
  }

  return (
    <main style={{ padding: 20, fontFamily: 'ui-sans-serif, system-ui', background: '#f5f7fb', minHeight: '100vh' }}>
      <h1>Comic Pipeline MVP - Step Wizard</h1>
      <p>{statusText}</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <section style={{ background: '#fff', padding: 12, borderRadius: 12 }}>
          <h2>Series Input</h2>
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
          <label>Total Episodes (max 30)</label>
          <input type="number" min={1} max={30} value={totalEpisodes} onChange={(e) => setTotalEpisodes(Number(e.target.value))} style={{ width: '100%', marginBottom: 8 }} />
          <label>Ratio</label>
          <select value={ratio} onChange={(e) => setRatio(e.target.value)} style={{ width: '100%', marginBottom: 8 }}>
            <option value="9:16">9:16</option>
            <option value="16:9">16:9</option>
          </select>
          <label>Language Mode</label>
          <select value={languageMode} onChange={(e) => setLanguageMode(e.target.value)} style={{ width: '100%', marginBottom: 8 }}>
            <option value="BM_SABAH">BM_SABAH</option>
            <option value="HYBRID">HYBRID</option>
            <option value="SULUK">SULUK</option>
            <option value="BAJAU">BAJAU</option>
          </select>
          <label>Style Preset</label>
          <input value={stylePreset} onChange={(e) => setStylePreset(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
          <button onClick={createSeries}>Create Series</button>
          <div style={{ marginTop: 8 }}>Series ID: {seriesId || '-'}</div>
        </section>

        <section style={{ background: '#fff', padding: 12, borderRadius: 12 }}>
          <h2>Episode Builder</h2>
          <label>Episode Number</label>
          <input type="number" min={1} value={epNumber} onChange={(e) => setEpNumber(Number(e.target.value))} style={{ width: '100%', marginBottom: 8 }} />
          <label>Panel Count (9 or 12)</label>
          <select value={panelCount} onChange={(e) => setPanelCount(Number(e.target.value))} style={{ width: '100%', marginBottom: 8 }}>
            <option value={9}>9</option>
            <option value={12}>12</option>
          </select>
          <button onClick={async () => setEpisodeId(await ensureEpisode())}>Prepare Episode</button>
          <div style={{ marginTop: 8 }}>Episode ID: {episodeId || '-'}</div>

          <div style={{ marginTop: 12 }}>
            {STEP_ORDER.map((s) => {
              const st = stepStatus[s.key];
              return (
                <div key={s.key} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{s.label}</strong>
                    <button onClick={() => runSingleStep(s.key)}>Run / Retry</button>
                  </div>
                  <div>Status: {st.status} | Progress: {st.progress}% | Job: {st.jobId || '-'}</div>
                  {st.error ? <div style={{ color: '#b91c1c' }}>Error: {st.error}</div> : null}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section style={{ background: '#fff', padding: 12, borderRadius: 12, marginTop: 16 }}>
        <h2>Batch Generate</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 120px 1fr auto', gap: 8, alignItems: 'center' }}>
          <input type="number" min={1} value={batchFrom} onChange={(e) => setBatchFrom(Number(e.target.value))} />
          <input type="number" min={1} value={batchTo} onChange={(e) => setBatchTo(Number(e.target.value))} />
          <div>
            {STEP_ORDER.map((s) => (
              <label key={s.key} style={{ marginRight: 12 }}>
                <input type="checkbox" checked={selectedSteps.has(s.key)} onChange={() => toggleBatchStep(s.key)} /> {s.key}
              </label>
            ))}
          </div>
          <button onClick={runBatch}>Run Batch</button>
        </div>
      </section>

      <section style={{ background: '#fff', padding: 12, borderRadius: 12, marginTop: 16 }}>
        <h2>Episode List</h2>
        <button onClick={refreshEpisodes}>Refresh Episodes</button>
        <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Episode</th>
              <th style={{ textAlign: 'left' }}>Status</th>
              <th style={{ textAlign: 'left' }}>Title</th>
              <th style={{ textAlign: 'left' }}>ID</th>
              <th style={{ textAlign: 'left' }}>Detail</th>
            </tr>
          </thead>
          <tbody>
            {episodes.map((ep) => (
              <tr key={ep.id}>
                <td>EP{String(ep.epNumber).padStart(2, '0')}</td>
                <td>{ep.status}</td>
                <td>{ep.title}</td>
                <td>{ep.id}</td>
                <td>
                  <a href={`/episodes/${ep.id}`} target="_blank" rel="noreferrer">
                    View
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
