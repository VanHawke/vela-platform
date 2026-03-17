import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=300') // cache 5 min on CDN

  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('kiko_avatar_url')
      .not('kiko_avatar_url', 'is', null)
      .limit(1)
      .single()

    if (error || !data) {
      return res.status(200).json({ brandLogo: null })
    }

    return res.status(200).json({ brandLogo: data.kiko_avatar_url })
  } catch (err) {
    return res.status(200).json({ brandLogo: null })
  }
}
