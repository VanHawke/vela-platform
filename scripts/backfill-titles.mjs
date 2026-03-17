import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

// Run with: SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_KEY=... node --input-type=module < scripts/backfill-titles.mjs
const sb = createClient(
  process.env.VITE_SUPABASE_URL || 'https://dwiywqeleyckzcxbwrlb.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_KEY
})

function getBestSignal(conv) {
  const msgs = conv.messages || []
  const userMsgs = msgs.filter(m => m.role === 'user' && m.content && m.content.length > 5)
  if (!userMsgs.length) return null
  const noise = /^(hey|hi|hello|kiko|can you hear|are you there|testing|test|okay|yes|no|got it|thank you|thanks|loud and clear|good morning|good afternoon|good evening)/i
  const meaningful = userMsgs.find(m => !noise.test(m.content.trim()))
  const firstMsg = meaningful || userMsgs[0]
  const assistantMsgs = msgs.filter(m => m.role === 'assistant' && m.content && m.content.length > 20)
  const firstReply = assistantMsgs[0]?.content?.slice(0, 200) || ''
  return { userMsg: firstMsg.content.slice(0, 300), reply: firstReply }
}

async function generateTitle(signal) {
  const prompt = signal.reply
    ? `User: "${signal.userMsg}"\nAssistant: "${signal.reply}"\n\nWrite a 3-5 word title for this conversation. Only the title, no quotes, no punctuation at end.`
    : `User: "${signal.userMsg}"\n\nWrite a 3-5 word title for this conversation. Only the title, no quotes, no punctuation at end.`
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 20,
    messages: [{ role: 'user', content: prompt }]
  })
  return res.content?.[0]?.text?.trim() || null
}

async function run() {
  const { data: convs, error } = await sb
    .from('conversations').select('id, title, messages')
    .order('updated_at', { ascending: false }).limit(200)
  if (error) { console.error('Fetch error:', error.message); process.exit(1) }
  console.log(`Processing ${convs.length} conversations...\n`)
  let updated = 0, skipped = 0
  for (const conv of convs) {
    const signal = getBestSignal(conv)
    if (!signal) { console.log(`SKIP (empty): ${conv.id.slice(0,8)}`); skipped++; continue }
    await new Promise(r => setTimeout(r, 350))
    try {
      const title = await generateTitle(signal)
      if (!title) { skipped++; continue }
      await sb.from('conversations').update({ title }).eq('id', conv.id)
      console.log(`✓ "${(conv.title||'').slice(0,40).replace(/\n/g,' ')}" → "${title}"`)
      updated++
    } catch (err) {
      console.log(`✗ ${conv.id.slice(0,8)}: ${err.message}`)
      skipped++
    }
  }
  console.log(`\nDone. Updated: ${updated} | Skipped: ${skipped}`)
}

run()
