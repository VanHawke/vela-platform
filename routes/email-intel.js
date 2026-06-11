// routes/email-intel.js — API routes for Kiko Email Intelligence Engine
import express from 'express';
import { findEmail, enrichProspect, verifyEmail } from '../lib/emailIntel.js';

const router = express.Router();

// POST /email-intel/find — Find and verify an email address
router.post('/find', async (req, res) => {
  const { firstName, lastName, company, domain } = req.body;
  if (!firstName || !lastName || !domain) {
    return res.status(400).json({ error: 'firstName, lastName, domain required' });
  }
  try {
    const result = await findEmail({ firstName, lastName, company, domain });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /email-intel/enrich — Find email + LinkedIn URL
router.post('/enrich', async (req, res) => {
  const { firstName, lastName, company, domain } = req.body;
  if (!firstName || !lastName || !domain) {
    return res.status(400).json({ error: 'firstName, lastName, domain required' });
  }
  try {
    const result = await enrichProspect({ firstName, lastName, company, domain });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /email-intel/verify — Verify a known email address
router.post('/verify', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const result = await verifyEmail(email);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /email-intel/bulk — Enrich multiple prospects
router.post('/bulk', async (req, res) => {
  const { prospects } = req.body;
  if (!Array.isArray(prospects) || prospects.length === 0) {
    return res.status(400).json({ error: 'prospects array required' });
  }
  // Process sequentially to avoid overwhelming SMTP servers
  const results = [];
  for (const p of prospects.slice(0, 50)) { // max 50 per batch
    try {
      const result = await enrichProspect({
        firstName: p.firstName || p.first_name,
        lastName: p.lastName || p.last_name,
        company: p.company,
        domain: p.domain || p.company_website,
      });
      results.push({ ...result, input: p });
    } catch (err) {
      results.push({ ok: false, error: err.message, input: p });
    }
  }
  res.json({ ok: true, results, count: results.length });
});

export default router;
