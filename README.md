# A2A Research, Edit & Write Suite

A multi-agent academic writing pipeline that takes a topic, researches it using live arXiv papers, drafts a journal-quality paper, and edits it to publication standard — all coordinated by AI agents.

---

## Does it use ADK?

Yes. The entire pipeline is built on **Google Agent Development Kit (ADK)**. Every agent is an `LlmAgent` from `google.adk.agents`, orchestrated by ADK's `Runner` and `InMemorySessionService`. ADK handles the agent lifecycle, tool registration, and execution loop.

## Is it Multi-Agent?

Yes. Four agents work in sequence, each with a distinct role:

```
User Input
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  ORCHESTRATOR  (Groq llama-3.1-8b-instant)          │
│  Reads the user message and decides the route:      │
│  • Topic given      → full pipeline                 │
│  • Research notes   → write + edit only             │
│  • Complete draft   → edit only                     │
└───────────────────────┬─────────────────────────────┘
                        │
          ┌─────────────┼──────────────┐
          ▼             ▼              ▼
      [full]         [write]        [edit]
          │             │              │
          ▼             │              │
┌─────────────────┐     │              │
│  RESEARCHER     │     │              │
│  Groq 70b       │     │              │
│  Tools:         │     │              │
│  • search_arxiv │     │              │
│  • MCP fetch    │     │              │
│  Searches arXiv,│     │              │
│  writes report  │     │              │
└────────┬────────┘     │              │
         │              │              │
         ▼              ▼              │
┌─────────────────────────────────┐    │
│  WRITER  (Groq llama-3.3-70b)   │    │
│  Takes research report or notes │    │
│  Writes full academic paper:    │    │
│  Abstract, Intro, Methodology,  │    │
│  Results, Discussion, References│    │
└────────────────┬────────────────┘    │
                 │                     │
                 ▼                     ▼
┌─────────────────────────────────────────────────────┐
│  EDITOR  (Groq llama-3.3-70b)                       │
│  Polishes the draft:                                │
│  • Fixes passive voice                              │
│  • Removes AI-pattern phrasing                      │
│  • Verifies citations and figure labels             │
│  • Humanization score                               │
│  Returns final publication-ready manuscript         │
└─────────────────────────────────────────────────────┘
```

## Does it use MCP?

Yes. The Researcher agent uses **Model Context Protocol (MCP)** via `McpToolset` and `mcp-server-fetch`. This gives the agent the ability to fetch any URL — arxiv paper pages, IEEE articles, Nature links — as a live tool call during research.

```python
McpToolset(
    connection_params=StdioConnectionParams(
        server_params=StdioServerParameters(command="uvx", args=["mcp-server-fetch"])
    )
)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent Framework | Google ADK (Agent Development Kit) |
| LLM — Routing | Groq `llama-3.1-8b-instant` |
| LLM — Research | Groq `llama-3.3-70b-versatile` |
| LLM — Writing | Groq `llama-3.3-70b-versatile` |
| LLM — Editing | Groq `llama-3.3-70b-versatile` |
| Tool — arXiv | Custom `search_arxiv` function tool |
| Tool — Web fetch | MCP `mcp-server-fetch` |
| Backend | FastAPI + Uvicorn |
| Auth | JWT (python-jose) + bcrypt |
| Database | SQLite + SQLAlchemy |
| Frontend | Vanilla JS + marked.js |

---

## Three Pipelines

### 1. Full Pipeline — Topic → Research → Write → Edit
Give a research topic. The system searches arXiv for real papers, synthesizes a research report, writes a complete academic paper, and edits it.

**Example:**
> Federated learning for privacy-preserving medical diagnosis in IoT healthcare systems

### 2. Write Pipeline — Notes → Write → Edit
Paste your own research notes or bullet findings. The system writes and edits a full paper from them.

**Example:**
> Here are my research notes:
> - Transformer attention scales quadratically with sequence length
> - FlashAttention reduces memory via IO-aware tiling
> - Sparse attention trades recall for speed
> Write this up as an academic paper.

### 3. Edit Pipeline — Draft → Edit
Paste a complete draft. The editor fixes passive voice, academic tone, citations, and removes AI-pattern phrasing.

---

## Running Locally

```bash
# 1. Install dependencies
cd adk_rebuild
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install uvx

# 2. Set environment variables
cp .env.example .env
# Add your GROQ_API_KEY to .env

# 3. Start the server
uvicorn server:app --host 0.0.0.0 --port 8000

# 4. Open in browser
open http://localhost:8000
```

---

## Environment Variables

```env
GROQ_API_KEY=your_groq_api_key
JWT_SECRET=your_secret_key
DATABASE_URL=sqlite:///./data/papers.db
```

---

## Project Structure

```
adk_rebuild/
├── server.py              # FastAPI server, auth endpoints, /chat endpoint
├── pipeline.py            # ADK orchestration, LLM routing, agent runner
├── database.py            # SQLAlchemy models (User, Paper)
├── auth.py                # JWT auth, bcrypt password hashing
├── agents/
│   ├── research_agent.py  # Researcher — arXiv search + MCP fetch
│   ├── writer_agent.py    # Writer — academic paper drafting
│   └── editor_agent.py    # Editor — polish and humanize
├── tools/
│   └── research_tools.py  # search_arxiv function tool
└── research-suite 2/      # Frontend (HTML, CSS, JS)
    ├── app.html
    ├── suite.js
    ├── suite.css
    └── paper.js
```
