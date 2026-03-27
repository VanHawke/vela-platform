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

        # Memory — learning log, thought journal, conversation insights, relationships
        memories = await sb("kiko_learning_log?select=category,insight,context&order=created_at.desc&limit=15")
        if memories:
            parts.append("MEMORY (learning): " + "; ".join(f"[{m.get('category','')}] {m.get('insight','')[:80]}" for m in memories[:10]))

        thoughts = await sb("kiko_thought_journal?select=topic,reflection&order=created_at.desc&limit=5")
        if thoughts:
            parts.append("MEMORY (thoughts): " + "; ".join(f"{t.get('topic','')}: {t.get('reflection','')[:60]}" for t in thoughts[:5]))

        insights = await sb("kiko_conversation_insights?select=topic,insight,status&order=created_at.desc&limit=5")
        if insights:
            parts.append("MEMORY (insights): " + "; ".join(f"{i.get('topic','')}: {i.get('insight','')[:60]} [{i.get('status','')}]" for i in insights[:5]))

        relationships = await sb("kiko_relationships?select=name,role,company,warmth_score,context&order=warmth_score.desc&limit=10")
        if relationships:
            parts.append("KEY RELATIONSHIPS: " + "; ".join(f"{r.get('name','?')} ({r.get('role','')}, {r.get('company','')}, warmth {r.get('warmth_score','')})" for r in relationships[:10]))

        # User profile
        profiles = await sb("kiko_user_profiles?select=profile_data&limit=1")
        if profiles and profiles[0].get('profile_data'):
            pd = profiles[0]['profile_data']
            parts.append(f"USER PROFILE: {json.dumps(pd)[:300]}")

        preferences = await sb("kiko_preferences?select=category,preference,value&limit=10")
        if preferences:
            parts.append("PREFERENCES: " + "; ".join(f"{p.get('category','')}: {p.get('preference','')}={p.get('value','')}" for p in preferences))
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


@function_tool
async def recall_memory(context: RunContext, query: str):
    """Search Kiko's memory for specific information about Sunny, past conversations, relationships, or learned facts. Use when asked 'do you remember', 'what do you know about', or for any personal/historical question not in preloaded data."""
    results = []
    # Search learning log
    logs = await sb(f"kiko_learning_log?select=category,insight,context&or=(insight.ilike.*{query}*,context.ilike.*{query}*,category.ilike.*{query}*)&limit=5")
    for l in (logs or []):
        results.append(f"[learned] {l.get('insight','')}")
    # Search thought journal
    thoughts = await sb(f"kiko_thought_journal?select=topic,reflection&or=(topic.ilike.*{query}*,reflection.ilike.*{query}*)&limit=3")
    for t in (thoughts or []):
        results.append(f"[thought] {t.get('topic','')}: {t.get('reflection','')[:100]}")
    # Search relationships
    rels = await sb(f"kiko_relationships?select=name,role,company,context,warmth_score&or=(name.ilike.*{query}*,company.ilike.*{query}*,context.ilike.*{query}*)&limit=5")
    for r in (rels or []):
        results.append(f"[relationship] {r.get('name','?')} — {r.get('role','')}, {r.get('company','')}, warmth {r.get('warmth_score','')}: {r.get('context','')[:80]}")
    if not results:
        return f"No memories found for '{query}'."
    return "; ".join(results)


@function_tool
async def search_emails(context: RunContext, query: str):
    """Search emails via the Kiko API. Use for any email-related questions: 'check my emails', 'last email from X', 'any emails about Y'."""
    return await call_kiko_api(f"Search my emails for: {query}")


@function_tool
async def search_web(context: RunContext, query: str):
    """Search the web for current information. Use for news, weather details, company research, market data, or anything requiring up-to-date information."""
    return await call_kiko_api(f"Search the web for: {query}")


@function_tool
async def ask_kiko(context: RunContext, query: str):
    """Route complex operations to the full Kiko Intelligence OS. Use for: drafting emails, moving deals, strategy analysis, detailed research, screen context, navigation, or anything the other tools can't handle."""
    return await call_kiko_api(query)


async def call_kiko_api(message: str) -> str:
    """POST to Kiko API for operations requiring full platform access (email, strategy, drafting)."""
    payload = {"message": message, "userEmail": "sunny@vanhawke.com", "currentPage": "home", "conversationHistory": [], "voiceMode": True}
    text_parts = []
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post("https://vela-platform-one.vercel.app/api/kiko", json=payload, headers={"Content-Type": "application/json"}, timeout=aiohttp.ClientTimeout(total=25)) as resp:
                async for line in resp.content:
                    decoded = line.decode("utf-8").strip()
                    if decoded.startswith("data: ") and decoded[6:] != "[DONE]":
                        try:
                            data = json.loads(decoded[6:])
                            if "delta" in data: text_parts.append(data["delta"])
                        except: pass
    except Exception as e:
        return f"Error: {str(e)}"
    return "".join(text_parts) or "No response."


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
        instructions=f"""You are Kiko, the voice AI assistant for Van Hawke Group. You work with Sunny Sidhu, the CEO, based in Weybridge, UK.

LIVE DATA (loaded at session start — answer from this for common questions):
{context_data}

YOUR CAPABILITIES:
- Pipeline, deals, alerts, race calendar, tasks → answer from LIVE DATA above (instant, no tools)
- Specific deal lookup → use search_deal tool
- Contact lookup → use search_contacts tool
- Memory recall → use recall_memory tool (for "do you remember", "what do you know about me", personal history)
- Weather → use get_weather tool
- Email access → use search_emails tool (for "check emails", "any emails from X")
- Web search → use search_web tool (for news, current events, company research)
- Complex operations (draft emails, move deals, strategy) → use ask_kiko tool

RULES:
- You have FULL memory across sessions. When asked "do you remember" — say YES and use recall_memory.
- You have email access. When asked about emails — use search_emails.
- You can search the web. When asked about current events — use search_web.
- Keep ALL responses under 2-3 sentences. Ultra concise for voice.
- Say numbers naturally: "twenty-nine million" not "$29,000,000".
- Never mention tools, data sources, or "according to". Speak as Kiko naturally.
- Never say "I don't have access" or "I can't". You CAN. Use the right tool.
- For greetings, respond directly and warmly. No tool calls.""",
    )

    await session.start(agent=agent, room=ctx.room)
    await session.generate_reply(
        instructions="Say only: Evening Sunny. What are we working on?"
    )


if __name__ == "__main__":
    cli.run_app(server)
