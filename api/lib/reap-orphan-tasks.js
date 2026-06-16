// api/lib/reap-orphan-tasks.js — One-shot cleanup of orphaned background tasks.
//
// A kiko_background_tasks row is left status='running' ONLY when the worker
// process died mid-execution (deploy / crash / reboot) before kiko-task-create.js
// could finalise it. In normal operation the brain self-terminates within ~105s
// and the row is always marked done/error. So any 'running' task older than a few
// minutes is, by definition, an orphan from a previous process. This runs once on
// worker startup (server.js) — the exact moment those orphans are created.
import { sbFetch } from '../kiko-tools.js';

export async function reapOrphanTasks() {
  try {
    // Brain ceiling is ~105s; 3 min guard avoids touching a task legitimately
    // created in the first seconds after this boot.
    const cutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const reaped = await sbFetch(
      `kiko_background_tasks?status=eq.running&created_at=lt.${cutoff}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          status: 'error',
          error_message: 'Task interrupted (worker restarted before completion). Please re-run.',
          completed_at: new Date().toISOString(),
        }),
      }
    );
    const n = Array.isArray(reaped) ? reaped.length : 0;
    if (n > 0) console.log(`[task-reaper] marked ${n} orphaned running task(s) as error`);
    else console.log('[task-reaper] no orphaned tasks');
  } catch (e) {
    console.error('[task-reaper] sweep failed (non-fatal):', e?.message || e);
  }
}
