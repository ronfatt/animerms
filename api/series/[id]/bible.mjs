import { getSeriesBible, upsertSeriesBible } from '../../../dist/jobs/service.js';

export default async function handler(req, res) {
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid series id' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const bible = await getSeriesBible(id);
      if (!bible) {
        res.status(404).json({ error: 'Series Bible not found' });
        return;
      }
      res.status(200).json(bible);
      return;
    }

    if (req.method === 'POST') {
      const body = req.body ?? {};
      const content = body.content;
      const locked = Boolean(body.locked);
      if (!content || typeof content !== 'object') {
        res.status(400).json({ error: 'content object is required' });
        return;
      }

      const updated = await upsertSeriesBible(id, content, locked);
      res.status(200).json(updated);
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
