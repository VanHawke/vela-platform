# voice-agent/agent.py — Kiko Voice Agent v3 (Ultra-Low Latency)
# PRE-LOADED CONTEXT: Common data loaded at session start → zero tool calls for briefs
# DIRECT SUPABASE: No HTTP hop to Kiko API for lookups
# HAIKU: 10x faster than Sonnet for routing
# PREEMPTIVE GENERATION: Starts thinking before you finish speaking

import os
import json
import aiohttp
import pathlib
from datetime import datetime
from dotenv import load_dotenv
from livekit.agents import (
    Agent, AgentSession, JobContext, RunContext,
    function_tool, cli, AgentServer,
)
from livekit.plugins import anthropic, silero

load_dotenv(dotenv_path=".env.local")

SUPABASE_URL = "https://dwiywqeleyckzcxbwrlb.supabase.co/rest/v1"
SUPABASE_KEY = ""
parent_env = pathlib.Path(__file__).parent.parent / ".env.local"
if parent_env.exists():
    for line in parent_env.read_text().splitlines():
        if line.startswith("VITE_SUPABASE_ANON_KEY="):
            SUPABASE_KEY = line.split("=", 1)[1].strip().strip('"')

HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}

async def sb(endpoint: str) -> list | dict:
    """Direct Supabase REST query — ~50ms."""
    async with aiohttp.ClientSession() as s:
        async with s.get(f"{SUPABASE_URL}/{endpoint}", headers=HEADERS, timeout=aiohttp.ClientTimeout(total=5)) as r:
            return await r.json()


async def preload_context() -> str:
    """Load all common data ONCE at session start. Haiku answers from this — no tool calls needed."""
    parts = []
    try:
        # Pipeline summary
        deals = await sb("deals?select=data&limit=100")
        active = [d for d in (deals or []) if d.get("data", {}).get("status") not in ("won", "lost")]
        total = sum(d.get("data", {}).get("value", 0) for d in active)
        stages = {}
        for d in active:
            s = d.get("data", {}).get("stage", "?")
            stages[s] = stages.get(s, 0) + 1
        top = sorted(stages.items(), key=lambda x: -x[1])[:5]
        parts.append(f"PIPELINE: {len(active)} active deals, ${total/1e6:.1f}M total. Stages: {', '.join(f'{s}({c})' for s,c in top)}.")

        # Top 5 deals by value
        top_deals = sorted(active, key=lambda d: d.get("data",{}).get("value",0), reverse=True)[:5]
        deal_lines = []
        for d in top_deals:
            dd = d.get("data", {})
            deal_lines.append(f"{dd.get('company','?')}: ${dd.get('value',0)/1e6:.1f}M, {dd.get('stage','?')}, contact {dd.get('contactName','?')}")
        parts.append("TOP DEALS: " + "; ".join(deal_lines))

        # Alerts
        alerts = await sb("kiko_alerts?dismissed=eq.false&select=type,severity,title,detail&order=created_at.desc&limit=5")
        if alerts:
            parts.append("ALERTS: " + "; ".join(f"[{a.get('severity','')}] {a.get('title','')}" for a in alerts[:5]))

        # Next race
        today = datetime.now().strftime("%Y-%m-%d")
        races = await sb(f"race_calendar?date=gt.{today}&order=date.asc&limit=1&select=name,date,circuit,city")
        if races:
            r = races[0]
            parts.append(f"NEXT RACE: {r.get('name','')} on {r.get('date','')} at {r.get('circuit','')}, {r.get('city','')}.")

        # Tasks
        tasks = await sb("tasks?select=data&order=updated_at.desc&limit=10")
        outstanding = [t for t in (tasks or []) if not t.get("data", {}).get("completed")]
        if outstanding:
            parts.append(f"TASKS: {len(outstanding)} outstanding. " + "; ".join(t['data'].get('notes','')[:60] for t in outstanding[:3]))
    except Exception as e:
        parts.append(f"(Context load error: {e})")

    return "\n".join(parts)


# ── TOOLS — Only for queries NOT answerable from preloaded context ──

@function_tool
async def search_deal(context: RunContext, company_name: str):
    """Search for a specific deal by company name. Only use when asked about a company NOT in the preloaded top deals."""
    deals = await sb(f"deals?select=data&data->>company=ilike.*{company_name}*&limit=3")
    if not deals: return f"No deals found for {company_name}."
    return "; ".join(f"{d['data'].get('company','?')}: ${d['data'].get('value',0)/1e6:.1f}M, {d['data'].get('stage','?')}" for d in deals)

@function_tool
async def get_weather(context: RunContext, location: str):
    """Get current weather. Use for any weather question."""
    async with aiohttp.ClientSession() as s:
        async with s.get(f"https://wttr.in/{location}?format=j1", timeout=aiohttp.ClientTimeout(total=3)) as r:
            data = await r.json()
            c = data.get("current_condition", [{}])[0]
            return f"{location}: {c.get('weatherDesc',[{}])[0].get('value','?')}, {c.get('temp_C','?')}°C, feels like {c.get('FeelsLikeC','?')}°C."

@function_tool
async def search_contacts(context: RunContext, name: str):
    """Search contacts by name."""
    contacts = await sb(f"contacts?select=data&data->>name=ilike.*{name}*&limit=3")
    if not contacts: return f"No contacts found for {name}."
    return "; ".join(f"{c['data'].get('name','?')}: {c['data'].get('title','?')} at {c['data'].get('company','?')}, {c['data'].get('email','')}" for c in contacts)


# ── ENTRYPOINT ──
server = AgentServer()

@server.rtc_session()
async def entrypoint(ctx: JobContext):
    # Pre-load ALL common data BEFORE the session starts
    # This means "brief me", "pipeline update", "any alerts", "next race" etc.
    # are answered from context with ZERO tool calls (~400ms total)
    context_data = await preload_context()

    session = AgentSession(
        vad=silero.VAD.load(),
        stt="deepgram/nova-3",
        llm=anthropic.LLM(model="claude-haiku-4-5-20251001"),
        tts="cartesia/sonic-3:f786b574-daa5-4673-aa0c-cbe3e8534c02",
        preemptive_generation=True,
    )

    agent = Agent(
        instructions=f"""You are Kiko, voice assistant for Van Hawke Group. You work with Sunny, the CEO.

LIVE DATA (loaded just now):
{context_data}

RULES:
- Answer from the LIVE DATA above whenever possible. NO tool calls needed for pipeline briefs, alerts, next race, or tasks.
- Only use search_deal for companies NOT in the data above.
- Only use get_weather for weather questions.
- Only use search_contacts to look up specific people.
- Keep ALL responses under 2-3 sentences. Ultra concise.
- Say numbers naturally: "twenty-nine million" not "$29,000,000".
- Never mention tools, data sources, or "according to". Speak as Kiko.
- For greetings, respond directly. No tool calls.""",
    )

    await session.start(agent=agent, room=ctx.room)
    await session.generate_reply(
        instructions="Say only: Evening Sunny. What are we working on?"
    )


if __name__ == "__main__":
    cli.run_app(server)
