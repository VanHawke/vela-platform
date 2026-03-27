# voice-agent/agent.py — Kiko Voice Agent (Phase 13)
# LiveKit Agents + Deepgram STT + Claude Sonnet + Deepgram Aura-2 TTS (Helena)
# Routes all queries through existing Kiko API for full 23-agent intelligence.

import os
import json
import aiohttp
from dotenv import load_dotenv
from livekit.agents import (
    Agent, AgentSession, JobContext, RunContext,
    function_tool, cli, AgentServer,
)
from livekit.plugins import deepgram, anthropic, silero

load_dotenv(dotenv_path=".env.local")

KIKO_API_URL = os.getenv("KIKO_API_URL", "https://vela-platform-one.vercel.app/api/kiko")


async def call_kiko_api(message: str, conversation_history: list = None) -> str:
    """POST to Kiko API and parse SSE response to extract text."""
    payload = {
        "message": message,
        "userEmail": "sunny@vanhawke.com",
        "currentPage": "home",
        "conversationHistory": conversation_history or [],
        "voiceMode": True,
    }
    
    text_parts = []
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                KIKO_API_URL,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                async for line in resp.content:
                    decoded = line.decode("utf-8").strip()
                    if not decoded.startswith("data: "):
                        continue
                    data_str = decoded[6:]
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        if "delta" in data:
                            text_parts.append(data["delta"])
                    except json.JSONDecodeError:
                        continue
    except Exception as e:
        return f"I encountered an error reaching the intelligence layer: {str(e)}"

    return "".join(text_parts) or "I processed your request but had no response."


@function_tool
async def ask_kiko(context: RunContext, query: str):
    """Ask Kiko Intelligence OS. Kiko has full access to: CRM pipeline (38 deals, $29.5M),
    5,006 contacts, 2,243 companies, 389 F1 partnerships, race calendar, Gmail, Google Calendar,
    Lemlist campaigns, deal signals, news articles, memory engine, and can draft emails, move deals,
    create tasks, run financial analysis, negotiate, research companies, and more.
    Use this for ALL data queries, actions, briefings, emails, and analysis."""
    result = await call_kiko_api(query)
    return result


class KikoVoiceAgent(Agent):
    def __init__(self):
        super().__init__(
            instructions="""You are Kiko — the AI voice assistant for Van Hawke Group.
You work with Sunny Sidhu, CEO, based in Weybridge, UK.

CRITICAL RULES:
1. For ANY request involving data, pipeline, deals, contacts, emails, calendar, Lemlist, 
   partnerships, briefings, strategy, or actions — ALWAYS use the ask_kiko tool.
2. Only answer directly for simple greetings or general knowledge questions.
3. Keep voice responses concise — max 3-4 sentences. Be direct, high-signal, no fluff.
4. Never say "the tool said" or "according to the system" — speak as Kiko naturally.
5. Use "intelligent age" not "AI generation". All financials in USD.
6. When relaying ask_kiko results, speak them naturally — don't read raw data dumps.
   Summarise key points in conversational voice-friendly format.

STYLE: Direct, corporate, warm authority. Lead with value. No "happy to help."
You are Sunny's strategic partner, not a generic assistant.""",
        )

    async def on_enter(self):
        self.session.generate_reply(
            instructions="Greet Sunny briefly. Say something like 'Good [morning/afternoon/evening] Sunny. What would you like to work on?'"
        )


# ── Entrypoint ──
server = AgentServer()

@server.rtc_session()
async def entrypoint(ctx: JobContext):
    session = AgentSession(
        vad=silero.VAD.load(),
        # Deepgram Nova-3 for STT (via LiveKit Inference — included in free tier)
        stt="deepgram/nova-3",
        # Claude Sonnet for LLM (via Anthropic plugin — uses our ANTHROPIC_API_KEY)
        llm=anthropic.LLM(model="claude-sonnet-4-20250514"),
        # Deepgram Aura-2 Helena for TTS (via LiveKit Inference — cheapest option)
        tts="deepgram/aura-2-helena-en",
    )
    await session.start(
        agent=KikoVoiceAgent(),
        room=ctx.room,
    )


if __name__ == "__main__":
    cli.run_app(server)
