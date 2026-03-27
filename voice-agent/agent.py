# voice-agent/agent.py — Kiko Voice Agent v4 (Thin Wrapper)
# Speech → Deepgram STT → Text → Kiko API (same as text chat) → Response → Cartesia TTS → Speech
# The agent is JUST a voice layer. ALL intelligence comes from the Kiko API.

import os
import json
import aiohttp
import pathlib
from dotenv import load_dotenv
from livekit.agents import (
    Agent, AgentSession, JobContext, RunContext,
    function_tool, cli, AgentServer,
)
from livekit.plugins import anthropic, silero

load_dotenv(dotenv_path=".env.local")

KIKO_API = "https://vela-platform-one.vercel.app/api/kiko"

async def call_kiko(message: str, page: str = "home") -> str:
    """Send to Kiko API — exact same backend as text chat."""
    payload = {
        "message": message,
        "userEmail": "sunny@vanhawke.com",
        "currentPage": page,
        "conversationHistory": [],
        "voiceMode": True,
    }
    text_parts = []
    try:
        async with aiohttp.ClientSession() as s:
            async with s.post(
                KIKO_API, json=payload,
                headers={"Content-Type": "application/json"},
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                async for line in resp.content:
                    decoded = line.decode("utf-8").strip()
                    if not decoded.startswith("data: "):
                        continue
                    d = decoded[6:]
                    if d == "[DONE]":
                        break
                    try:
                        j = json.loads(d)
                        if "delta" in j:
                            text_parts.append(j["delta"])
                    except:
                        pass
    except Exception as e:
        return f"Sorry, I had trouble connecting. {str(e)}"
    return "".join(text_parts) or "I processed that but got no response."


@function_tool
async def ask_kiko(context: RunContext, query: str):
    """Send ANY user query to Kiko Intelligence OS. Kiko has full access to:
    memory, emails, pipeline, deals, contacts, calendar, web search, screen context,
    and 23 specialist agents. Use this for EVERY query — no exceptions."""
    result = await call_kiko(query)
    return result


server = AgentServer()

@server.rtc_session()
async def entrypoint(ctx: JobContext):
    session = AgentSession(
        vad=silero.VAD.load(),
        stt="deepgram/nova-3",
        llm=anthropic.LLM(model="claude-haiku-4-5-20251001"),
        tts="cartesia/sonic-3:f786b574-daa5-4673-aa0c-cbe3e8534c02",
        preemptive_generation=True,
    )

    agent = Agent(
        instructions="""You are Kiko, voice assistant for Van Hawke Group. You work with Sunny Sidhu, the CEO.

CRITICAL: NEVER output any reasoning, thinking, or internal monologue. NEVER explain what you're about to do. Just do it.

For greetings (hi, hello, hey, good morning, thanks, bye): respond directly with a warm short reply. Do NOT call ask_kiko for greetings.

For EVERYTHING else: call ask_kiko immediately with the user's exact words. Do NOT add commentary before or after the tool call. Just call the tool and speak the result.

When speaking results: keep it to 2-3 sentences max. Say numbers naturally. Never mention tools or systems. You ARE Kiko.""",
    )

    await session.start(agent=agent, room=ctx.room)
    await session.generate_reply(
        instructions="Say only: Evening Sunny. What are we working on?"
    )


if __name__ == "__main__":
    cli.run_app(server)
