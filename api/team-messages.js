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

        // @kiko bot detection — trigger AI response
        if (content.toLowerCase().includes('@kiko')) {
          const kikoQuestion = content.replace(/@kiko/gi, '').trim();
          if (kikoQuestion) {
            // Fire and forget — don't block the send response
            (async () => {
              try {
                const Anthropic = (await import('@anthropic-ai/sdk')).default;
                const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
                const selfKnowledge = (await import('./kiko-self-knowledge.js')).generateSelfKnowledge;
                const knowledge = await selfKnowledge(fromUserId).catch(() => '');
                
                const response = await anthropic.messages.create({
                  model: 'claude-sonnet-4-6', max_tokens: 800,
                  system: `You are Kiko, the AI assistant for Van Hawke Group. You're responding in a team chat channel. Keep answers concise and direct — this is instant messaging, not a formal conversation. Use short paragraphs, not walls of text.\n\n${knowledge}`,
                  messages: [{ role: 'user', content: `${fromName} asked in team chat: ${kikoQuestion}` }]
                });
                const kikoReply = response.content?.[0]?.text || 'Sorry, I couldn\'t process that.';
                
                await sbFetch('kiko_team_messages', { method: 'POST', body: JSON.stringify({
                  channel_id: channelId,
                  from_user_id: '00000000-0000-0000-0000-000000000000',
                  from_name: 'Kiko',
                  content: kikoReply,
                  message_type: 'kiko_response',
                  read_by: [],
                }) });
                await sbFetch(`kiko_team_channels?id=eq.${channelId}`, {
                  method: 'PATCH', body: JSON.stringify({ last_message_at: new Date().toISOString() })
                });
              } catch (e) { console.error('[team-messages] Kiko bot error:', e.message); }
            })();
          }
        }

        return res.json({ success: true });
      }

      case 'read': {
        const { channelId, userId } = req.body || {};
        if (!channelId || !userId) return res.status(400).json({ error: 'Missing channelId or userId' });
        const unread = await sbFetch(`kiko_team_messages?channel_id=eq.${channelId}&read_by=not.cs.{${userId}}&select=id,read_by`);
        for (const msg of (unread || [])) {
          const newReadBy = [...(msg.read_by || []), userId];
          await sbFetch(`kiko_team_messages?id=eq.${msg.id}`, {
            method: 'PATCH', body: JSON.stringify({ read_by: newReadBy })
          });
        }
        return res.json({ success: true, marked: unread?.length || 0 });
      }

      case 'presence': {
        const { userId, status, statusMessage } = req.body || {};
        if (!userId) return res.status(400).json({ error: 'Missing userId' });
        if (status) {
          await sbFetch(`kiko_user_presence?user_id=eq.${userId}`, {
            method: 'PATCH', body: JSON.stringify({ status, status_message: statusMessage || null, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          });
        }
        const all = await sbFetch('kiko_user_presence?select=user_id,status,status_message,last_seen_at');
        return res.json({ presence: all || [] });
      }

      case 'react': {
        const { messageId, userId, emoji } = req.body || {};
        if (!messageId || !userId || !emoji) return res.status(400).json({ error: 'Missing messageId, userId, or emoji' });
        const msgs = await sbFetch(`kiko_team_messages?id=eq.${messageId}&select=reactions`);
        const msg = msgs?.[0];
        if (!msg) return res.status(404).json({ error: 'Message not found' });
        const reactions = msg.reactions || {};
        const users = reactions[emoji] || [];
        if (users.includes(userId)) {
          reactions[emoji] = users.filter(u => u !== userId);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...users, userId];
        }
        await sbFetch(`kiko_team_messages?id=eq.${messageId}`, {
          method: 'PATCH', body: JSON.stringify({ reactions })
        });
        return res.json({ success: true, reactions });
      }

      case 'edit': {
        const { messageId, userId, content } = req.body || {};
        if (!messageId || !userId || !content) return res.status(400).json({ error: 'Missing fields' });
        const msgs = await sbFetch(`kiko_team_messages?id=eq.${messageId}&from_user_id=eq.${userId}&select=id`);
        if (!msgs?.length) return res.status(403).json({ error: 'Cannot edit this message' });
        await sbFetch(`kiko_team_messages?id=eq.${messageId}`, {
          method: 'PATCH', body: JSON.stringify({ content, edited_at: new Date().toISOString() })
        });
        return res.json({ success: true });
      }

      case 'delete': {
        const { messageId, userId } = req.body || {};
        if (!messageId || !userId) return res.status(400).json({ error: 'Missing fields' });
        const msgs = await sbFetch(`kiko_team_messages?id=eq.${messageId}&from_user_id=eq.${userId}&select=id`);
        if (!msgs?.length) return res.status(403).json({ error: 'Cannot delete this message' });
        await sbFetch(`kiko_team_messages?id=eq.${messageId}`, {
          method: 'PATCH', body: JSON.stringify({ deleted_at: new Date().toISOString(), content: 'This message was deleted' })
        });
        return res.json({ success: true });
      }

      case 'pin': {
        const { messageId, pinned } = req.body || {};
        if (!messageId) return res.status(400).json({ error: 'Missing messageId' });
        await sbFetch(`kiko_team_messages?id=eq.${messageId}`, {
          method: 'PATCH', body: JSON.stringify({ pinned: pinned !== false })
        });
        return res.json({ success: true });
      }

      case 'pinned': {
        const { channelId } = req.body || {};
        if (!channelId) return res.status(400).json({ error: 'Missing channelId' });
        const pinned = await sbFetch(`kiko_team_messages?channel_id=eq.${channelId}&pinned=eq.true&order=created_at.desc&limit=5&select=id,content,from_name,created_at`);
        return res.json({ pinned: pinned || [] });
      }

      case 'react': {
        const { messageId, userId, emoji } = req.body || {};
        if (!messageId || !userId || !emoji) return res.status(400).json({ error: 'Missing fields' });
        const msgs = await sbFetch(`kiko_team_messages?id=eq.${messageId}&select=reactions`);
        const msg = msgs?.[0];
        if (!msg) return res.status(404).json({ error: 'Message not found' });
        const reactions = msg.reactions || {};
        const users = reactions[emoji] || [];
        if (users.includes(userId)) {
          reactions[emoji] = users.filter(u => u !== userId);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...users, userId];
        }
        await sbFetch(`kiko_team_messages?id=eq.${messageId}`, { method: 'PATCH', body: JSON.stringify({ reactions }) });
        return res.json({ success: true });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('[team-messages] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
