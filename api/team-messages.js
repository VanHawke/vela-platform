// api/team-messages.js — Team messaging API
import { sbFetch } from './kiko-tools.js';

export default async function handler(req, res) {
  const { action } = req.query || {};
  
  try {
    switch (action) {
      case 'channels': {
        const channels = await sbFetch('kiko_team_channels?order=last_message_at.desc');
        // Get last message for each channel
        for (const ch of (channels || [])) {
          const msgs = await sbFetch(`kiko_team_messages?channel_id=eq.${ch.id}&order=created_at.desc&limit=1&select=content,from_name,created_at`);
          ch.lastMessage = msgs?.[0] || null;
          // Count unread
          const userId = req.body?.userId || req.query?.userId;
          if (userId) {
            const unread = await sbFetch(`kiko_team_messages?channel_id=eq.${ch.id}&read_by=not.cs.{${userId}}&select=id`);
            ch.unreadCount = unread?.length || 0;
          }
        }
        return res.json({ channels });
      }

      case 'messages': {
        const { channelId, limit = 50, before } = req.body || {};
        if (!channelId) return res.status(400).json({ error: 'Missing channelId' });
        let query = `kiko_team_messages?channel_id=eq.${channelId}&order=created_at.desc&limit=${limit}`;
        if (before) query += `&created_at=lt.${before}`;
        const messages = await sbFetch(query);
        return res.json({ messages: (messages || []).reverse() });
      }

      case 'send': {
        const { channelId, fromUserId, fromName, fromAvatar, content, messageType = 'text', replyTo } = req.body || {};
        if (!channelId || !fromUserId || !content) return res.status(400).json({ error: 'Missing required fields' });
        const msg = {
          channel_id: channelId,
          from_user_id: fromUserId,
          from_name: fromName || 'Unknown',
          from_avatar: fromAvatar || null,
          content,
          message_type: messageType,
          reply_to: replyTo || null,
          read_by: [fromUserId],
        };
        await sbFetch('kiko_team_messages', { method: 'POST', body: JSON.stringify(msg) });
        // Update channel last_message_at
        await sbFetch(`kiko_team_channels?id=eq.${channelId}`, {
          method: 'PATCH', body: JSON.stringify({ last_message_at: new Date().toISOString() })
        });
        return res.json({ success: true });
      }

      case 'read': {
        const { channelId, userId } = req.body || {};
        if (!channelId || !userId) return res.status(400).json({ error: 'Missing channelId or userId' });
        // Mark all messages in channel as read by this user
        const unread = await sbFetch(`kiko_team_messages?channel_id=eq.${channelId}&read_by=not.cs.{${userId}}&select=id,read_by`);
        for (const msg of (unread || [])) {
          const newReadBy = [...(msg.read_by || []), userId];
          await sbFetch(`kiko_team_messages?id=eq.${msg.id}`, {
            method: 'PATCH', body: JSON.stringify({ read_by: newReadBy })
          });
        }
        return res.json({ success: true, marked: unread?.length || 0 });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('[team-messages] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
