import streamlit as st
import asyncio
import uuid
import re
import nest_asyncio
import streamlit.components.v1 as components
from dotenv import load_dotenv

nest_asyncio.apply()
load_dotenv()

from pipeline import run_pipeline

st.set_page_config(
    page_title="Academic Writing Suite",
    page_icon="📄",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
    .main-header {
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
        padding: 2rem;
        border-radius: 12px;
        margin-bottom: 1.5rem;
        color: white;
    }
    .main-header h1 { color: white; margin: 0; font-size: 2rem; }
    .main-header p  { color: #a0aec0; margin: 0.3rem 0 0 0; font-size: 0.95rem; }

    .pipeline-bar {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 0.8rem 1.2rem;
        margin-bottom: 1.2rem;
    }
    .pipeline-step {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.85rem;
        font-weight: 600;
        color: #4a5568;
        padding: 0.3rem 0.8rem;
        border-radius: 6px;
        background: #edf2f7;
    }
    .pipeline-arrow { color: #a0aec0; font-size: 1rem; }

    .example-btn {
        background: #eef2ff;
        border: 1px solid #c7d2fe;
        border-radius: 8px;
        padding: 0.5rem 0.7rem;
        font-size: 0.8rem;
        color: #3730a3;
        cursor: pointer;
        width: 100%;
        text-align: left;
        margin-bottom: 0.4rem;
    }

    .word-count {
        font-size: 0.75rem;
        color: #718096;
        text-align: right;
        margin-top: 0.3rem;
    }

    .stChatMessage { border-radius: 12px; }
</style>
""", unsafe_allow_html=True)


def init_state():
    if "session_id" not in st.session_state:
        st.session_state.session_id = str(uuid.uuid4())
    if "messages" not in st.session_state:
        st.session_state.messages = []
    if "fill_input" not in st.session_state:
        st.session_state.fill_input = None


def render_mermaid(diagram: str):
    html = f"""
    <!DOCTYPE html><html><body style="margin:0;background:#fff;">
    <div class="mermaid" style="text-align:center;">{diagram}</div>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <script>mermaid.initialize({{startOnLoad:true,theme:'default',securityLevel:'loose'}});</script>
    </body></html>
    """
    components.html(html, height=380, scrolling=True)


def render_response(text: str):
    parts = re.split(r'(```mermaid[\s\S]*?```)', text)
    for part in parts:
        if part.startswith("```mermaid"):
            diagram = re.sub(r'^```mermaid\s*', '', part)
            diagram = re.sub(r'\s*```$', '', diagram)
            render_mermaid(diagram.strip())
        else:
            if part.strip():
                st.markdown(part)


def word_count(text: str) -> int:
    return len(text.split())


init_state()

# ── Sidebar ────────────────────────────────────────────────
with st.sidebar:
    st.markdown("### 📄 Academic Writing Suite")
    st.caption("Google ADK + Gemini")
    st.divider()

    st.markdown("**Try an example:**")

    examples = [
        "Research and write a full academic paper on federated learning in healthcare",
        "Research the latest findings on large language model hallucinations",
        "Write a paper from these notes: [paste your research notes here]",
        "Edit this draft: [paste your draft here]",
        "Summarise this paper: https://arxiv.org/abs/2301.07067",
    ]

    for ex in examples:
        if st.button(ex[:60] + "..." if len(ex) > 60 else ex,
                     key=ex, use_container_width=True):
            st.session_state.fill_input = ex

    st.divider()
    st.markdown("**How it works:**")
    st.markdown("""
- **Topic only** → Research + Write + Edit
- **Your research** → Write + Edit
- **Your draft** → Edit only
- **arxiv link** → Read + Summarise
""")

    st.divider()
    if st.button("🗑️ New Conversation", use_container_width=True):
        st.session_state.session_id = str(uuid.uuid4())
        st.session_state.messages = []
        st.rerun()

    st.caption(f"Session `{st.session_state.session_id[:8]}…`")

# ── Header ─────────────────────────────────────────────────
st.markdown("""
<div class="main-header">
  <h1>📄 Academic Research &amp; Writing Suite</h1>
  <p>Multi-agent pipeline: Research → Write → Edit &nbsp;|&nbsp; Powered by Google ADK + Gemini</p>
</div>
""", unsafe_allow_html=True)

# ── Pipeline bar ───────────────────────────────────────────
st.markdown("""
<div class="pipeline-bar">
  <span class="pipeline-step">🔍 Research Agent</span>
  <span class="pipeline-arrow">→</span>
  <span class="pipeline-step">✍️ Writer Agent</span>
  <span class="pipeline-arrow">→</span>
  <span class="pipeline-step">✏️ Editor Agent</span>
  <span class="pipeline-arrow">→</span>
  <span class="pipeline-step">🎯 Orchestrator decides the route</span>
</div>
""", unsafe_allow_html=True)

# ── Chat history ───────────────────────────────────────────
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        if msg["role"] == "assistant":
            render_response(msg["content"])
            st.markdown(
                f'<div class="word-count">{word_count(msg["content"])} words</div>',
                unsafe_allow_html=True,
            )
            st.download_button(
                label="⬇️ Download as Markdown",
                data=msg["content"],
                file_name="academic_paper.md",
                mime="text/markdown",
                key=f"dl_{msg['content'][:20]}",
            )
        else:
            st.markdown(msg["content"])

# ── Pre-fill from sidebar example ─────────────────────────
default_input = ""
if st.session_state.fill_input:
    default_input = st.session_state.fill_input
    st.session_state.fill_input = None

# ── Chat input ─────────────────────────────────────────────
prompt = st.chat_input(
    "Enter a topic, paste research notes, paste a draft, or drop an arxiv link…"
)

if not prompt and default_input:
    prompt = default_input

if prompt:
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    with st.chat_message("assistant"):
        with st.status("Agents working…", expanded=True) as status:
            st.write("🎯 Orchestrator reading your intent…")
            st.write("🔍 Research Agent searching arxiv + web…")
            st.write("✍️ Writer Agent drafting paper…")
            st.write("✏️ Editor Agent refining and humanising…")
            try:
                loop = asyncio.new_event_loop()
                response = loop.run_until_complete(
                    run_pipeline(prompt, st.session_state.session_id)
                )
                loop.close()
                status.update(label="Done!", state="complete", expanded=False)
            except Exception as e:
                response = f"Something went wrong: {str(e)}"
                status.update(label="Error", state="error", expanded=True)

        render_response(response)
        st.markdown(
            f'<div class="word-count">{word_count(response)} words</div>',
            unsafe_allow_html=True,
        )
        st.download_button(
            label="⬇️ Download as Markdown",
            data=response,
            file_name="academic_paper.md",
            mime="text/markdown",
            key="dl_latest",
        )

    st.session_state.messages.append({"role": "assistant", "content": response})
