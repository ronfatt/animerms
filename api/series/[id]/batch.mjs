import { queueBatchForSeries } from '../../../dist/jobs/service.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const id = Number(req.query.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid series id' });
      return;
    }

    const body = req.body ?? {};
    const startEpisode = Number(body.startEpisode);
    const endEpisode = Number(body.endEpisode);
    if (!Number.isInteger(startEpisode) || !Number.isInteger(endEpisode)) {
      res.status(400).json({ error: 'startEpisode and endEpisode must be integers' });
      return;
    }

    const queued = await queueBatchForSeries(id, startEpisode, endEpisode);
    res.status(200).json(queued);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
