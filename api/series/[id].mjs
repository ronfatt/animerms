import { getSeriesOverview } from '../../dist/jobs/service.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const id = Number(req.query.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid series id' });
      return;
    }

    const overview = await getSeriesOverview(id);
    if (!overview) {
      res.status(404).json({ error: 'Series not found' });
      return;
    }

    res.status(200).json(overview);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
