// api/pipeline-notifications.js — Pipeline activity feed
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const action = req.query?.action || req.body?.action || 'list';

  if (action === 'list') {
    const limit = parseInt(req.query?.limit || '20');
    const unreadOnly = req.query?.unread === 'true';
    let query = supabase.from('pipeline_notifications')
      .select('*').eq('is_dismissed', false)
      .order('created_at', { ascending: false }).limit(limit);
    if (unreadOnly) query = query.eq('is_read', false);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Count unread
    const { count } = await supabase.from('pipeline_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false).eq('is_dismissed', false);

    return res.json({ notifications: data || [], unread: count || 0 });
  }

  if (action === 'mark_read' && req.method === 'POST') {
    const { id } = req.body;
    if (id === 'all') {
      await supabase.from('pipeline_notifications').update({ is_read: true }).eq('is_read', false);
    } else if (id) {
      await supabase.from('pipeline_notifications').update({ is_read: true }).eq('id', id);
    }
    return res.json({ ok: true });
  }

  if (action === 'dismiss' && req.method === 'POST') {
    const { id } = req.body;
    await supabase.from('pipeline_notifications').update({ is_dismissed: true }).eq('id', id);
    return res.json({ ok: true });
  }

  if (action === 'stats') {
    const { count: total } = await supabase.from('pipeline_notifications')
      .select('id', { count: 'exact', head: true });
    const { count: unread } = await supabase.from('pipeline_notifications')
      .select('id', { count: 'exact', head: true }).eq('is_read', false).eq('is_dismissed', false);
    const { count: highPriority } = await supabase.from('pipeline_notifications')
      .select('id', { count: 'exact', head: true }).in('priority', ['high', 'urgent']).eq('is_read', false);
    return res.json({ total, unread, highPriority });
  }

  return res.status(400).json({ error: 'action: list|mark_read|dismiss|stats' });
}
