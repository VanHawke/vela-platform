// api/kiko-debug.js — Temporary diagnostic endpoint
export default async function handler(req, res) {
  const errors = [];
  
  try { await import('@anthropic-ai/sdk'); } catch(e) { errors.push('anthropic: ' + e.message); }
  try { await import('./kiko-tools.js'); } catch(e) { errors.push('kiko-tools: ' + e.message); }
  try { await import('./agents/intent-classifier.js'); } catch(e) { errors.push('intent-classifier: ' + e.message); }
  try { await import('./kiko-self-knowledge.js'); } catch(e) { errors.push('self-knowledge: ' + e.message); }
  try { await import('./agents/screen-reader.js'); } catch(e) { errors.push('screen-reader: ' + e.message); }
  try { await import('./company-lookup.js'); } catch(e) { errors.push('company-lookup: ' + e.message); }
  try { await import('./agents/ea.js'); } catch(e) { errors.push('ea: ' + e.message); }
  
  // Check env vars
  const env = {
    ANTHROPIC_KEY: !!process.env.ANTHROPIC_KEY,
    VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  
  // Try to import and call kiko handler
  let kikoImport = 'not tested';
  try {
    const mod = await import('./kiko.js');
    kikoImport = typeof mod.default === 'function' ? 'OK' : 'no default export';
  } catch(e) {
    kikoImport = 'FAILED: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0,3).join('\n');
  }
  
  res.json({ errors, env, kikoImport, timestamp: new Date().toISOString() });
}
