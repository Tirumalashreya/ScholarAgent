import os
import sys
import re
import json
import time
import uuid
import nest_asyncio
import litellm
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools.mcp_tool import McpToolset, StdioConnectionParams
from mcp import StdioServerParameters
from google.genai import types
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from agents.research_agent import create_research_agent
from agents.writer_agent import create_writer_agent
from agents.editor_agent import create_editor_agent

nest_asyncio.apply()

# ── Groq/Llama tool-call format fixes ─────────────────────────────────────────
#
# Problem 1: ADK adds "title":"search_arxivParams" to tool schemas.
#   Llama reads that title as the function name → wrong call.
#   Fix: strip all "title" keys from every tool schema.
#
# Problem 2: Llama-3.3-70b-versatile generates Hermes XML format:
#   <function=search_arxiv,{"query":"..."}></function>
#   Groq's API rejects this with code "tool_use_failed".
#   Fix: catch that error, parse the Hermes call, return a synthetic
#   OpenAI-format response so ADK can proceed normally.

def _strip_titles(obj):
    if isinstance(obj, dict):
        return {k: _strip_titles(v) for k, v in obj.items() if k != "title"}
    if isinstance(obj, list):
        return [_strip_titles(i) for i in obj]
    return obj


def _fix_unquoted_json(s):
    """Fix {key: value} → {"key": "value"} for unquoted JSON from llama-3.1-8b."""
    s = re.sub(r'([{,])\s*(\w+)\s*:', r'\1 "\2":', s)
    s = re.sub(r':\s*([A-Za-z_]\w*)\s*([,}])', r': "\1"\2', s)
    return s


def _parse_inline_call(text):
    """Detect (function=transfer_to_agent>{args}) in a text response — Ollama variant.
    Only intercepts transfer_to_agent to avoid confusing real tool calls with hallucinated ones."""
    try:
        m = re.search(r'\(function=(transfer_to_agent)[>\s,]*(\{[^)]+\})\)', text)
        if not m:
            return None, None
        name = m.group(1)
        raw = m.group(2)
        try:
            json.loads(raw)
            args = raw
        except json.JSONDecodeError:
            args = _fix_unquoted_json(raw)
            json.loads(args)
        if json.loads(args).get("agent_name") == "orchestrator":
            return None, None
        return name, args
    except Exception:
        return None, None


def _extract_hermes_call(exc):
    """Return (func_name, args_json_str) from a Groq tool_use_failed error, or (None, None)."""
    try:
        s = str(exc)
        idx = s.find("GroqException - ")
        if idx == -1:
            return None, None
        payload = json.loads(s[idx + 16:])
        failed_gen = payload.get("error", {}).get("failed_generation", "")
        # Hermes format variants (with comma, without comma, with =, with []):
        m = re.search(r"<function=(\w+)[,=\s\[]*(\{.*?\})\s*(?:</function>|$)", failed_gen, re.DOTALL)
        if not m:
            return None, None
        name = m.group(1).strip()
        args = m.group(2).strip()
        json.loads(args)   # validate
        # "orchestrator" routing to itself is a bad LLM decision — force retry
        if name == "transfer_to_agent":
            parsed = json.loads(args)
            if parsed.get("agent_name") == "orchestrator":
                return None, None
        return name, args
    except Exception:
        return None, None


def _synthetic_tool_response(func_name, func_args, model):
    """Build a litellm ModelResponse that looks like a valid tool-call completion."""
    call_id = f"call_{uuid.uuid4().hex[:8]}"
    return litellm.ModelResponse(
        id=f"chatcmpl-{uuid.uuid4().hex[:12]}",
        choices=[{
            "finish_reason": "tool_calls",
            "index": 0,
            "message": {
                "role": "assistant",
                "content": None,
                "tool_calls": [{
                    "id": call_id,
                    "type": "function",
                    "function": {"name": func_name, "arguments": func_args},
                }],
            },
        }],
        created=int(time.time()),
        model=model,
        object="chat.completion",
        usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    )


_orig_acompletion = litellm.acompletion

async def _acompletion_patched(*args, **kwargs):
    import asyncio, re as _re
    if kwargs.get("tools"):
        kwargs["tools"] = _strip_titles(kwargs["tools"])
    valid_tools = {t.get("function", {}).get("name") for t in (kwargs.get("tools") or [])}

    for attempt in range(5):
        try:
            response = await _orig_acompletion(*args, **kwargs)
            # Intercept text-based inline tool calls (Ollama variant)
            try:
                msg = response.choices[0].message
                if msg.content and not msg.tool_calls:
                    fn, fa = _parse_inline_call(msg.content)
                    if fn:
                        return _synthetic_tool_response(fn, fa, kwargs.get("model", ""))
            except Exception:
                pass
            # Reject hallucinated tool names and retry
            try:
                calls = response.choices[0].message.tool_calls
                if calls and valid_tools:
                    bad = [c.function.name for c in calls if c.function.name not in valid_tools]
                    if bad and attempt < 4:
                        import asyncio as _aio2; await _aio2.sleep(1)
                        continue
            except Exception:
                pass
            return response
        except litellm.BadRequestError as e:
            if "tool_use_failed" not in str(e) or attempt >= 4:
                raise
            func_name, func_args = _extract_hermes_call(e)
            if func_name:
                return _synthetic_tool_response(func_name, func_args, kwargs.get("model", ""))
            raise
        except litellm.RateLimitError as e:
            if attempt >= 4:
                raise
            # Extract "try again in Xs" from Groq's message, default 15s
            m = _re.search(r"try again in ([\d.]+)s", str(e))
            wait = float(m.group(1)) + 1 if m else 15
            await asyncio.sleep(wait)

litellm.acompletion = _acompletion_patched

# ── ADK setup ──────────────────────────────────────────────────────────────────

APP_NAME = "academic_suite"
USER_ID  = "user"
UVX_PATH = os.path.join(os.path.dirname(sys.executable), "uvx")


def _make_mcp():
    return McpToolset(
        connection_params=StdioConnectionParams(
            server_params=StdioServerParameters(command=UVX_PATH, args=["mcp-server-fetch"]),
            timeout=15.0,
        )
    )


ROUTER_INSTRUCTION = """You are a routing agent. Read the user message and output EXACTLY one word:

full   — user gave a research topic or question
write  — user gave research notes or bullet findings
edit   — user gave a complete draft paper

Output only the single word. Nothing else."""


async def _run_agent(agent, message: str, session_id: str) -> str:
    """Run one agent with a fresh session so context never accumulates."""
    svc = InMemorySessionService()
    await svc.create_session(app_name=APP_NAME, user_id=USER_ID, session_id=session_id)
    runner = Runner(agent=agent, app_name=APP_NAME, session_service=svc)
    content = types.Content(role="user", parts=[types.Part(text=message)])
    result = ""
    async for event in runner.run_async(user_id=USER_ID, session_id=session_id, new_message=content):
        if event.is_final_response() and event.content and event.content.parts:
            for part in event.content.parts:
                if part.text and not part.text.strip().startswith("{"):
                    result = part.text
    return result


async def _llm_route(user_message: str, session_id: str) -> str:
    router = LlmAgent(
        name="router",
        model=LiteLlm(model="groq/llama-3.1-8b-instant"),
        instruction=ROUTER_INSTRUCTION,
    )
    raw = await _run_agent(router, user_message, f"{session_id}_route")
    mode = raw.strip().lower().split()[0] if raw.strip() else "full"
    return mode if mode in ("full", "write", "edit") else "full"


async def _run_once(user_message: str, session_id: str) -> str:
    mode = await _llm_route(user_message, session_id)
    mcp = _make_mcp()
    try:
        if mode == "full":
            research = await _run_agent(
                create_research_agent(mcp),
                f"Research this topic thoroughly for a PhD-level academic paper:\n\n{user_message}",
                f"{session_id}_res",
            )
            draft = await _run_agent(
                create_writer_agent(),
                f"Write a complete PhD-level academic paper based on this research:\n\n{research}",
                f"{session_id}_wri",
            )
            return await _run_agent(
                create_editor_agent(),
                f"Edit and polish this academic paper to publication standard:\n\n{draft}",
                f"{session_id}_edi",
            )
        elif mode == "write":
            draft = await _run_agent(
                create_writer_agent(),
                f"Write a complete PhD-level academic paper from these research notes:\n\n{user_message}",
                f"{session_id}_wri",
            )
            return await _run_agent(
                create_editor_agent(),
                f"Edit and polish this academic paper to publication standard:\n\n{draft}",
                f"{session_id}_edi",
            )
        else:
            return await _run_agent(
                create_editor_agent(),
                f"Edit and polish this academic paper to publication standard:\n\n{user_message}",
                f"{session_id}_edi",
            )
    finally:
        await mcp.close()


async def run_pipeline(user_message: str, session_id: str) -> str:
    import asyncio as _aio
    import re as _re
    last_error = None
    for attempt in range(4):
        try:
            return await _run_once(user_message, f"{session_id}_a{attempt}")
        except Exception as e:
            last_error = e
            err = str(e)
            if attempt >= 3:
                break
            # Gemini 429 — honour the retry-after hint
            if "429" in err or "RESOURCE_EXHAUSTED" in err:
                m = _re.search(r"retry in ([\d.]+)s", err)
                wait = float(m.group(1)) + 2 if m else 35
                await _aio.sleep(wait)
            else:
                await _aio.sleep(5)
    raise last_error
