// api/linkedin-test.js — GET endpoint to verify LinkedIn cookie auth
import { linkedinTestAuth } from './linkedin-client.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const providedKey = req.query?.key || req.headers?.['x-test-key'];
  if (process.env.KIKO_CRON_SECRET && providedKey !== process.env.KIKO_CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const result = await linkedinTestAuth();
  return res.status(result.authenticated ? 200 : 500).json(result);
}
