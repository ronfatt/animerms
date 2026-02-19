import { retryEpisode } from '../../../dist/jobs/service.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const id = Number(req.query.id);
    const body = req.body ?? {};
    const episodeNo = Number(body.episodeNo);

    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(episodeNo) || episodeNo <= 0) {
      res.status(400).json({ error: 'Invalid id or episodeNo' });
      return;
    }

    const result = await retryEpisode(id, episodeNo);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
