# Kiko Mobile App - Design Brief

*For Claude Design. Paste this in and ask it to produce the screens in section 5.*
*Grounded in Kiko's live design tokens (src/lib/theme.js).*

## 1. What we're designing
An iOS-first mobile app for Kiko, an AI operating partner / chief-of-staff for a premium sports & brand advisory firm (F1 sponsorship deals, luxury eyewear). It is chat-first: the home screen is a living conversation with Kiko, who proactively surfaces what matters (deals, follow-ups, today's agenda) and executes tasks. It should feel like a calm, high-end intelligence app, not a busy SaaS dashboard. Match the existing web app's visual language exactly.

## 2. Visual system (exact tokens)
- Background #FEFEFC (warm off-white) | cards/surfaces #FFFFFF | pressed/hover #F5F4F1
- Text: primary #0A0A0A, secondary #6B6B6B, tertiary #A0A0A0, muted #C0C0C0
- Single accent: near-black #0A0A0A for primary buttons and active states. Monochrome and restrained; sophistication from whitespace, not colour (reference feel: Legora, Linear, Arc)
- Muted categorical accents, used sparingly for tags/status only: terracotta #B8643E, slate #5A6470, gold #B89C5C
- Type: Source Serif 4 for greetings/display headings (editorial, warm); Inter for all UI/body. Light weights only (300/400/450/500), no bold. Airy line-height.
- Radii: cards 14, inputs 16, pills 24, primary CTAs 4, full-round avatars/icon buttons
- Shadows: barely-there: 0 1px 2px rgba(0,0,0,0.04) resting, 0 4px 16px rgba(0,0,0,0.05) raised. Hairline dividers rgba(0,0,0,0.06). Depth via subtlety, never weight.

## 3. Signature elements
- "Kiko" wordmark in Source Serif 4
- An animated waveform avatar shown when she is thinking/listening/speaking: her "face", elegant and minimal
- A pill-shaped composer ("Ask Kiko anything...") with +, mic, and send button, pinned to the bottom within thumb reach

## 4. Information architecture - bottom tab bar (5 tabs)
1. Today (hero): serif greeting + date, the Kiko composer, quick-action chips (Brief me / Pipeline update / Check emails / What's on today?), then a short agenda feed (next event e.g. "Austrian Grand Prix - 28 June", urgent follow-ups, deals needing attention)
2. Pipeline: deals as a clean vertical list grouped by stage (company, value, stage, next action) -> deal detail
3. Records: contacts & companies; searchable rows -> profile with Kiko-generated insights
4. Campaigns: outreach sequences with simple status -> sequence detail
5. Messenger: email/message drafts Kiko prepared; review, edit, send

Partnership Matrix is secondary: reach it from Today; render it as a filterable list on mobile, not a dense grid.

## 5. Screens to produce (priority order)
1. Today / home (the hero)
2. Conversation view: full-screen chat; user bubbles right (subtle gray), Kiko's responses left with the waveform avatar + "Kiko" label, streaming state, pinned composer, voice toggle. Show a real example of her answering a strategic question concisely.
3. Voice mode: full-screen, minimal; large centred waveform, live transcript line, Listening/Thinking/Speaking states, tap-to-stop. A signature, premium moment.
4. Pipeline list + one deal detail
5. Contact/company profile with Kiko's insight summary
6. Bottom tab bar component (active/inactive states)

## 6. Feel
Chat-first and proactive: the home is a calm morning briefing, not a control panel. Fast, fluid, light haptics, pull-to-refresh, one clear focus per screen, primary actions in the bottom third.

## 7. Avoid
SaaS density, charts everywhere, bright colours, heavy borders/shadows, competing CTAs, bold type. Editorial, quiet, expensive-feeling.
