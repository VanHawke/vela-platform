// PartnershipMatrix.jsx — Insights / Bento Grid
// Mockup-faithful port of kiko-insights.html

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/layout/PageHeader'
import './PartnershipMatrix.css'

export default function PartnershipMatrix({ user }) {
  const [range, setRange] = useState('Q2')
  const [stats, setStats] = useState({
    pipelineValue: 73, replyRate: 14, hotReplies: 6,
    hoursSaved: 16, meetingsPrepped: 4, movedOvernight: 2.4,
    hoursSaved90d: 142, learning: 96, avgDeal: 3.2,
  })
  const [topSequences, setTopSequences] = useState([])

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      // Pipeline value + active deal count
      const { data: deals } = await supabase.from('deals').select('data')
      let pipelineValue = 0
      let activeCount = 0
      if (deals) {
        deals.forEach(d => {
          const stage = d.data?.stage
          if (stage && stage !== 'Closed Won' && stage !== 'Closed Lost') {
            activeCount++
            pipelineValue += parseFloat(d.data?.value || 0)
          }
        })
      }

      // Hot replies this week
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { count: hotCount } = await supabase
        .from('activities')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'reply')
        .gte('created_at', weekAgo)

      // Avg deal size
      const avgDeal = activeCount > 0 ? pipelineValue / activeCount : 0

      // Top sequences with reply rates
      const { data: sequences } = await supabase
        .from('kiko_sequences')
        .select('id, name')
        .order('created_at', { ascending: false })
        .limit(8)

      const enriched = []
      for (const s of (sequences || [])) {
        const { count: replied } = await supabase
          .from('activities')
          .select('*', { count: 'exact', head: true })
          .eq('type', 'reply')
          .eq('metadata->>sequence_id', s.id)
        // Approximate sent from queue or fall back to a baseline
        const { count: sent } = await supabase
          .from('activities')
          .select('*', { count: 'exact', head: true })
          .eq('type', 'email_sent')
          .eq('metadata->>sequence_id', s.id)
        enriched.push({ name: s.name, sent: sent || 0, replied: replied || 0 })
      }
      const ranked = enriched
        .filter(s => s.sent > 0 || s.replied > 0)
        .sort((a, b) => (b.replied / Math.max(1, b.sent)) - (a.replied / Math.max(1, a.sent)))
        .slice(0, 5)

      if (!cancelled) {
        setStats(s => ({
          ...s,
          pipelineValue: Math.round(pipelineValue / 1000000 * 10) / 10,
          hotReplies: hotCount || 0,
          avgDeal: Math.round(avgDeal / 1000000 * 10) / 10,
        }))
        setTopSequences(ranked)
      }
    })()
    return () => { cancelled = true }
  }, [user?.id, range])

  return (
    <div className="ins">
      <PageHeader
        eyebrowCategory="INTELLIGENCE"
        eyebrowSuffix="Q2 2026 performance"
        title="Insights"
        toolbar={
          <>
            <div className="ins-seg">
              {['7d', '30d', 'Q2', 'YTD'].map(r => (
                <button key={r} className={range === r ? 'active' : ''} onClick={() => setRange(r)}>{r}</button>
              ))}
            </div>
            <button className="ins-ghost-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export PDF
            </button>
          </>
        }
      />

      <div className="bento">

        {/* PIPELINE VALUE — wide hero */}
        <div className="card span-2">
          <div>
            <div className="card-h">Pipeline value · weighted<span className="h-pill">+12%</span></div>
            <div className="big-num huge"><span className="currency">$</span>{stats.pipelineValue}<span className="unit">m</span></div>
            <div className="delta up">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><polyline points="18 15 12 9 6 15"/></svg>
              +$8.2m<span className="vs">vs last month</span>
            </div>
          </div>
          <svg className="spark" viewBox="0 0 200 48" preserveAspectRatio="none">
            <path className="area" d="M0,40 L15,38 L30,35 L45,32 L60,28 L75,30 L90,24 L105,22 L120,18 L135,20 L150,15 L165,12 L180,10 L195,6 L200,4 L200,48 L0,48 Z"/>
            <path className="line" d="M0,40 L15,38 L30,35 L45,32 L60,28 L75,30 L90,24 L105,22 L120,18 L135,20 L150,15 L165,12 L180,10 L195,6 L200,4"/>
            <circle className="dot" cx="200" cy="4"/>
          </svg>
        </div>

        {/* REPLY RATE */}
        <div className="card">
          <div>
            <div className="card-h">Reply rate<span className="h-pill">+2pt</span></div>
            <div className="big-num">{stats.replyRate}%</div>
            <div className="sub">vs <strong>9%</strong> industry benchmark</div>
          </div>
          <svg className="spark" viewBox="0 0 200 36" preserveAspectRatio="none">
            <path className="line" d="M0,28 L25,30 L50,24 L75,22 L100,18 L125,20 L150,14 L175,12 L200,8"/>
            <circle className="dot" cx="200" cy="8"/>
          </svg>
        </div>

        {/* HOT REPLIES */}
        <div className="card">
          <div>
            <div className="card-h">Hot replies · this week<span className="h-pill">+3</span></div>
            <div className="big-num">{stats.hotReplies}</div>
          </div>
          <div className="sub"><strong>Bardrick</strong> · Citi<br/><strong>Sundheim</strong> · D1<br/><strong>Halford</strong> · ANZ</div>
        </div>

        {/* CHANNEL MIX donut */}
        <div className="card">
          <div className="card-h">Channel mix</div>
          <div className="donut-wrap">
            <svg className="donut" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="6"/>
              <circle cx="18" cy="18" r="14" fill="none" stroke="#5a6470" strokeWidth="6" strokeDasharray="54.5 87.9" strokeDashoffset="0" transform="rotate(-90 18 18)"/>
              <circle cx="18" cy="18" r="14" fill="none" stroke="#0A66C2" strokeWidth="6" strokeDasharray="27.3 87.9" strokeDashoffset="-54.5" transform="rotate(-90 18 18)"/>
              <circle cx="18" cy="18" r="14" fill="none" stroke="#b8643e" strokeWidth="6" strokeDasharray="6.1 87.9" strokeDashoffset="-81.8" transform="rotate(-90 18 18)"/>
            </svg>
            <div className="donut-legend">
              <div className="lr"><span className="ld" style={{background:'#5a6470'}}></span><span className="ln">Email</span><span className="lv">62%</span></div>
              <div className="lr"><span className="ld" style={{background:'#0A66C2'}}></span><span className="ln">LinkedIn</span><span className="lv">31%</span></div>
              <div className="lr"><span className="ld" style={{background:'#b8643e'}}></span><span className="ln">Signals</span><span className="lv">7%</span></div>
            </div>
          </div>
        </div>


        {/* SEQUENCE LEADERBOARD */}
        <div className="card span-3">
          <div>
            <div className="card-h">Sequence performance · reply rate</div>
            <div className="bar-list">
              {(topSequences.length > 0 ? topSequences : [
                { name: 'Gaming FE 2026', sent: 50, replied: 8, sector: 'gaming' },
                { name: 'F1 2027 Banking', sent: 64, replied: 9, sector: 'banking' },
                { name: 'FinTech FE 2026', sent: 36, replied: 4, sector: 'fintech' },
                { name: 'Telecoms MotoGP', sent: 22, replied: 2, sector: 'telecoms' },
                { name: 'Banking WEC 2026', sent: 30, replied: 2, sector: 'banking' },
              ]).map((s, i) => {
                const rate = s.sent > 0 ? Math.round((s.replied / s.sent) * 100) : 0
                const widthPct = Math.min(100, rate * 5)
                const sectorClass = s.sector || (s.name.toLowerCase().includes('bank') ? 'banking' : s.name.toLowerCase().includes('gam') ? 'gaming' : s.name.toLowerCase().includes('fin') ? 'fintech' : s.name.toLowerCase().includes('tele') ? 'telecoms' : 'banking')
                return (
                  <div className="bar-row" key={i}>
                    <div className="bn" title={s.name}>{s.name.length > 22 ? s.name.slice(0, 22) + '...' : s.name}</div>
                    <div className="bar-track"><div className={`bar-fill ${sectorClass}`} style={{ '--w': widthPct + '%' }}></div></div>
                    <div className="bv">{rate}%</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* KIKO IMPACT — wide */}
        <div className="card span-3">
          <div>
            <div className="card-h">Kiko impact · this week<span className="h-pill">Auto</span></div>
            <div className="ki-grid">
              <div><div className="big-num">{stats.hoursSaved}<span className="unit">h</span></div><div className="sub">saved vs manual prep</div></div>
              <div><div className="big-num">{stats.meetingsPrepped}</div><div className="sub">meetings auto-prepped</div></div>
              <div><div className="big-num"><span className="currency">$</span>{stats.movedOvernight}<span className="unit">m</span></div><div className="sub">moved overnight</div></div>
            </div>
          </div>
        </div>

        {/* SECTOR × SERIES HEATMAP */}
        <div className="card span-3 row-2">
          <div className="card-h">Pipeline value · sector × series<span className="h-pill">$73m total</span></div>
          <div className="heat">
            <div className="heat-h"></div><div className="heat-h">F1</div><div className="heat-h">FE</div><div className="heat-h">MotoGP</div><div className="heat-h">WEC</div>
            <div className="heat-row-label">Banking</div><div className="heat-cell v4">$22.4m</div><div className="heat-cell v0">—</div><div className="heat-cell v0">—</div><div className="heat-cell v1">$1.4m</div>
            <div className="heat-row-label">FinTech</div><div className="heat-cell v0">—</div><div className="heat-cell v3">$5.0m</div><div className="heat-cell v0">—</div><div className="heat-cell v0">—</div>
            <div className="heat-row-label">Gaming</div><div className="heat-cell v0">—</div><div className="heat-cell v2">$2.5m</div><div className="heat-cell v0">—</div><div className="heat-cell v0">—</div>
            <div className="heat-row-label">Telecoms</div><div className="heat-cell v0">—</div><div className="heat-cell v0">—</div><div className="heat-cell v2">$2.8m</div><div className="heat-cell v0">—</div>
            <div className="heat-row-label">Luxury</div><div className="heat-cell v1">$0.8m</div><div className="heat-cell v0">—</div><div className="heat-cell v0">—</div><div className="heat-cell v0">—</div>
          </div>
          <div className="sub" style={{marginTop:8}}>Banking × F1 is your strongest concentration. <strong>FinTech × FE 2026</strong> growing fastest (+38% this quarter). Gaming/MotoGP/WEC underdeveloped — expansion opportunity.</div>
        </div>

        {/* TOP TOUCH */}
        <div className="card">
          <span className="top-touch-tag">Top touch</span>
          <div>
            <div style={{fontFamily:'Source Serif 4, Georgia, serif',fontWeight:400,fontSize:16,lineHeight:1.25}}>Mercedes renewal angle</div>
            <div className="sub">Touch 3 · F1 2027 Banking</div>
            <div className="big-num" style={{fontSize:32,marginTop:10}}>23%</div>
            <div className="sub">reply rate · <strong>2.5×</strong> avg</div>
          </div>
          <a className="pri-link">Use as template →</a>
        </div>

        {/* KIKO HOURS SAVED */}
        <div className="card">
          <div>
            <div className="card-h">Kiko hours saved · 90d<span className="h-pill">+38%</span></div>
            <div className="big-num" style={{fontSize:34}}>{stats.hoursSaved90d}<span className="unit">h</span></div>
          </div>
          <svg className="spark" viewBox="0 0 200 48" preserveAspectRatio="none">
            <path className="area" d="M0,40 L20,38 L40,32 L60,30 L80,26 L100,22 L120,18 L140,14 L160,12 L180,8 L200,4 L200,48 L0,48 Z"/>
            <path className="line" d="M0,40 L20,38 L40,32 L60,30 L80,26 L100,22 L120,18 L140,14 L160,12 L180,8 L200,4"/>
            <circle className="dot" cx="200" cy="4"/>
          </svg>
        </div>


        {/* RACE CORRELATION CHART */}
        <div className="card span-4">
          <div className="card-h">Pipeline movement vs race weekends · last 90d<span className="h-pill">14–21d window confirmed</span></div>
          <div className="corr">
            <svg className="corr-svg" viewBox="0 0 600 110" preserveAspectRatio="none">
              <line x1="0" y1="100" x2="600" y2="100" stroke="rgba(0,0,0,0.06)"/>
              <line x1="60" y1="10" x2="60" y2="100" stroke="#b8643e" strokeWidth="0.6" strokeDasharray="2 3" opacity="0.5"/>
              <text x="62" y="14" className="corr-marker-label">AUS</text>
              <line x1="160" y1="10" x2="160" y2="100" stroke="#b8643e" strokeWidth="0.6" strokeDasharray="2 3" opacity="0.5"/>
              <text x="162" y="14" className="corr-marker-label">CHN</text>
              <line x1="290" y1="10" x2="290" y2="100" stroke="#b8643e" strokeWidth="0.6" strokeDasharray="2 3" opacity="0.5"/>
              <text x="292" y="14" className="corr-marker-label">JPN</text>
              <line x1="500" y1="10" x2="500" y2="100" stroke="#b8643e" strokeWidth="1.4" strokeDasharray="3 2"/>
              <text x="502" y="14" className="corr-marker-label" style={{fontSize:10}}>MIA · in 16d</text>
              <path d="M0,80 L20,78 L40,70 L60,55 L80,68 L100,60 L120,52 L140,42 L160,30 L180,48 L200,40 L220,32 L240,28 L260,20 L280,18 L300,12 L320,30 L340,38 L360,32 L380,28 L400,22 L420,18 L440,14 L460,10 L480,6 L500,4" stroke="#0A0A0A" strokeWidth="2" fill="none"/>
              <path d="M0,80 L20,78 L40,70 L60,55 L80,68 L100,60 L120,52 L140,42 L160,30 L180,48 L200,40 L220,32 L240,28 L260,20 L280,18 L300,12 L320,30 L340,38 L360,32 L380,28 L400,22 L420,18 L440,14 L460,10 L480,6 L500,4 L500,100 L0,100 Z" fill="rgba(10,10,10,0.04)"/>
              <circle cx="500" cy="4" r="3" fill="#0A0A0A"/>
            </svg>
            <div className="corr-x"><span>Mid-Jan</span><span>Feb</span><span>Mar</span><span>Now</span><span>Miami</span></div>
          </div>
          <div className="sub" style={{marginTop:8}}><strong>Pipeline movement spikes 14—21 days before each race weekend.</strong> Currently in peak window for Miami (R4). Outreach sent now lands when brand committees finalise activation budgets.</div>
        </div>

        {/* SIGNAL FEED */}
        <div className="card span-2 row-2">
          <div className="card-h">SponsorSignal · last 5<span className="h-pill">Live</span></div>
          <div className="feed">
            {[
              ['HSBC × Mercedes F1 partnership renewed through 2027', '2h ago · FT · 96% match'],
              ['James Bardrick promoted to Country Officer UK at Citi', 'Yesterday · LinkedIn · 99% match'],
              ['Sarah Lee joins JPMorgan Brand from AmEx · ex-Mercedes account lead', '2d ago · Press release · 99% match'],
              ['Stripe announces FE 2026 sponsorship interest publicly', '3d ago · TechCrunch · 88% match'],
              ['D1 Capital Q1 LP letter mentions sports IP investment thesis', '4d ago · Bloomberg · 78% match'],
            ].map(([title, meta], i) => (
              <div key={i} className="feed-item">
                <div className="feed-tag">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </div>
                <div className="feed-body">
                  <div className="feed-title">{title}</div>
                  <div className="feed-meta">{meta}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* KIKO LEARNING */}
        <div className="card">
          <div className="card-h">Kiko learning<span className="h-pill">Improving</span></div>
          <div className="big-num" style={{fontSize:32}}>{stats.learning}%</div>
          <div className="sub">tone match accuracy<br/>vs your edits last 30d</div>
        </div>

        {/* AVG DEAL SIZE */}
        <div className="card">
          <div className="card-h">Avg deal size<span className="h-pill">+18%</span></div>
          <div className="big-num" style={{fontSize:32}}><span className="currency">$</span>{stats.avgDeal}<span className="unit">m</span></div>
          <div className="sub">across <strong>42</strong> active deals</div>
        </div>

      </div>
    </div>
  )
}
