/* ===================================================================
   suite.js — chat, orchestrator routing, agent pipeline, doc rendering,
   session memory, localStorage auth.
   =================================================================== */
(function () {
  "use strict";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const SVG = (inner, sw = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}">${inner}</svg>`;

  // ---------- agent definitions ----------
  const ICON = {
    orch: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    research: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    writer: '<path d="M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>',
    editor: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  };

  const AGENTS = {
    orchestrator: { name: "Orchestrator Agent", tool: "router", ac: "--a-orch", act: "--a-orch-t", icon: ICON.orch },
    research: {
      name: "Research Agent", tool: "arxiv · web fetch", ac: "--a-research", act: "--a-research-t", icon: ICON.research,
      work: ["Querying arXiv.org…", "Reading candidate papers…", "Extracting key findings…", "Identifying gaps in literature…"],
      done: (t) => `Compiled research report on <b>${t}</b> — papers reviewed, Background · Key Findings · Gaps · Methodology drafted.`,
    },
    writer: {
      name: "Writer Agent", tool: "long-form drafting", ac: "--a-writer", act: "--a-writer-t", icon: ICON.writer,
      work: ["Structuring the outline…", "Drafting Abstract & Introduction…", "Writing Methodology & Results…", "Composing Conclusion & References…"],
      done: () => `Drafted full paper — Abstract, Introduction, Methodology, Results, Discussion, Conclusion, References.`,
    },
    editor: {
      name: "Editor Agent", tool: "tone · humanization", ac: "--a-editor", act: "--a-editor-t", icon: ICON.editor,
      work: ["Scanning for passive voice…", "Checking academic tone…", "Verifying figure/table labels…", "Removing AI-pattern phrasing…"],
      done: () => `Polished the draft — humanization score evaluated, Editor's Notes appended.`,
    },
  };

  // ---------- state ----------
  let mode = "auto";
  let running = false;
  let currentPaper = null;
  let abortController = null;
  let messages = [];
  const STORE        = "arws_session_v1";
  const HISTORY_STORE = "arws_history_v1";
  const USERS_STORE  = "arws_users_v1";
  const AUTH_STORE   = "arws_auth_v1";
  const SESSION_ID   = Math.random().toString(36).slice(2) + Date.now().toString(36);

  // ---------- auth helpers ----------
  function getAuth()  { try { return JSON.parse(localStorage.getItem(AUTH_STORE)); } catch(e) { return null; } }
  function setAuth(u) { localStorage.setItem(AUTH_STORE, JSON.stringify(u)); }
  function clearAuth(){ localStorage.removeItem(AUTH_STORE); localStorage.removeItem("arws_jwt"); }
  function getJWT()   { return localStorage.getItem("arws_jwt"); }
  function setJWT(t)  { localStorage.setItem("arws_jwt", t); }

  function updateRailAuth() {
    const foot = $(".rail-auth");
    if (!foot) return;
    const auth = getAuth();
    if (auth) {
      const initial = auth.name ? auth.name[0].toUpperCase() : auth.email[0].toUpperCase();
      foot.innerHTML = `
        <div class="rail-user">
          <div class="rail-user-av">${escapeHTML(initial)}</div>
          <span class="rail-user-name">${escapeHTML(auth.name || auth.email)}</span>
          <button class="rail-logout" id="btnLogout" type="button">Log out</button>
        </div>`;
      $("#btnLogout") && $("#btnLogout").addEventListener("click", () => {
        clearAuth(); updateRailAuth(); toast("Logged out");
      });
    } else {
      foot.innerHTML = `
        <button class="auth-btn" id="btnLogin" type="button">Log in</button>
        <button class="auth-btn primary" id="btnSignup" type="button">Sign up</button>`;
      $("#btnLogin")  && $("#btnLogin").addEventListener("click",  () => openAuthModal("login"));
      $("#btnSignup") && $("#btnSignup").addEventListener("click", () => openAuthModal("signup"));
    }
  }

  // ---------- auth modal ----------
  function openAuthModal(tab = "login") {
    setAuthTab(tab);
    $("#authBackdrop").classList.add("show");
    setTimeout(() => {
      const first = $("#authFormWrap input");
      if (first) first.focus();
    }, 50);
  }

  function closeAuthModal() {
    $("#authBackdrop").classList.remove("show");
  }

  function setAuthTab(tab) {
    $$(".auth-tab").forEach(t => t.classList.toggle("active", t.id === (tab === "login" ? "tabLogin" : "tabSignup")));
    renderAuthForm(tab);
  }

  function renderAuthForm(tab) {
    const wrap = $("#authFormWrap");
    if (!wrap) return;
    if (tab === "login") {
      wrap.innerHTML = `
        <div class="auth-error" id="authErr"></div>
        <div class="auth-field"><label>Email</label><input type="email" id="authEmail" autocomplete="email" placeholder="you@example.com"/></div>
        <div class="auth-field"><label>Password</label><input type="password" id="authPass" autocomplete="current-password" placeholder="••••••••"/></div>
        <button class="auth-submit" id="authSubmit" type="button">Log in</button>`;
      $("#authSubmit").addEventListener("click", doLogin);
      $("#authPass").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
    } else {
      wrap.innerHTML = `
        <div class="auth-error" id="authErr"></div>
        <div class="auth-field"><label>Name</label><input type="text" id="authName" autocomplete="name" placeholder="Your name"/></div>
        <div class="auth-field"><label>Email</label><input type="email" id="authEmail" autocomplete="email" placeholder="you@example.com"/></div>
        <div class="auth-field"><label>Password</label><input type="password" id="authPass" autocomplete="new-password" placeholder="At least 6 characters"/></div>
        <button class="auth-submit" id="authSubmit" type="button">Create account</button>`;
      $("#authSubmit").addEventListener("click", doSignup);
      $("#authPass").addEventListener("keydown", e => { if (e.key === "Enter") doSignup(); });
    }
  }

  function showAuthError(msg) {
    const el = $("#authErr");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
  }

  async function doLogin() {
    const email = ($("#authEmail") && $("#authEmail").value.trim()) || "";
    const pass  = ($("#authPass")  && $("#authPass").value) || "";
    if (!email || !pass) { showAuthError("Please fill in all fields."); return; }
    try {
      const resp = await fetch("/auth/login", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ email, password: pass }),
      });
      const data = await resp.json();
      if (!resp.ok) { showAuthError(data.detail || "Incorrect email or password."); return; }
      setJWT(data.token);
      setAuth({ email: data.email, name: data.name });
      closeAuthModal(); updateRailAuth(); renderRail();
      toast("Welcome back, " + (data.name || data.email) + "!");
    } catch(e) { showAuthError("Server error. Try again."); }
  }

  async function doSignup() {
    const name  = ($("#authName")  && $("#authName").value.trim()) || "";
    const email = ($("#authEmail") && $("#authEmail").value.trim()) || "";
    const pass  = ($("#authPass")  && $("#authPass").value) || "";
    if (!name || !email || !pass) { showAuthError("Please fill in all fields."); return; }
    if (pass.length < 6) { showAuthError("Password must be at least 6 characters."); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { showAuthError("Please enter a valid email."); return; }
    try {
      const resp = await fetch("/auth/signup", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ name, email, password: pass }),
      });
      const data = await resp.json();
      if (!resp.ok) { showAuthError(data.detail || "Signup failed."); return; }
      setJWT(data.token);
      setAuth({ email: data.email, name: data.name });
      closeAuthModal(); updateRailAuth(); renderRail();
      toast("Account created! Welcome, " + name + ".");
    } catch(e) { showAuthError("Server error. Try again."); }
  }

  // ---------- routing (sent to orchestrator — not used for hard logic) ----------
  function route(text, forced) {
    const t = text.toLowerCase();
    const hasURL = /\bhttps?:\/\/|arxiv\.org|nature\.com|ieee|springer/.test(t);
    const looksLikeDraft = text.length > 600 || /\babstract\b|\bintroduction\b|\bwe propose\b|## /i.test(text);
    const looksLikeNotes = /\bnotes?:|\bfindings?:|\bbullet|^\s*[-*]\s/im.test(text) || (text.length > 220 && text.length <= 600);

    let chosen, reason;
    if (forced === "edit" || (forced === "auto" && looksLikeDraft)) {
      chosen = ["editor"];
      reason = `This reads as a <b>complete draft</b>, so I'll route it to the <b>Editor Agent</b> only — refining tone, voice, and labels without rewriting your work.`;
    } else if (forced === "write" || (forced === "auto" && looksLikeNotes)) {
      chosen = ["writer", "editor"];
      reason = `You've supplied <b>research notes</b>. I'll skip retrieval and hand them to the <b>Writer Agent</b>, then the <b>Editor Agent</b> for polish.`;
    } else {
      chosen = ["research", "writer", "editor"];
      reason = hasURL
        ? `You pasted a source URL on a new topic. I'll run the full pipeline: <b>Research</b> (reading your link + arXiv) → <b>Writer</b> → <b>Editor</b>.`
        : `This is a <b>new topic</b>, so I'll invoke all three agents in sequence: <b>Research</b> → <b>Writer</b> → <b>Editor</b>.`;
    }
    return { chosen, reason };
  }

  // ---------- message rendering ----------
  function elFromHTML(html) {
    const d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }

  function addUserMessage(text) {
    const html = `<div class="msg msg-user reveal-up"><div class="bubble">${escapeHTML(text)}</div></div>`;
    const el = elFromHTML(html);
    $("#thread").appendChild(el);
    messages.push({ role: "user", html });
    scrollThread();
    return el;
  }

  function asstMessage(innerHTML) {
    const html = `<div class="msg msg-asst reveal-up">
        <div class="who"><span class="av">${SVG(ICON.orch, 1.7)}</span><span class="nm">Suite <span>· multi-agent</span></span></div>
        <div class="text">${innerHTML}</div>
      </div>`;
    const el = elFromHTML(html);
    $("#thread").appendChild(el);
    messages.push({ role: "asst", html });
    scrollThread();
    return el;
  }

  function scrollThread() {
    const t = $("#thread");
    requestAnimationFrame(() => { t.scrollTop = t.scrollHeight; });
  }

  // ---------- agent run card ----------
  function buildRunCard(chosen, reason) {
    const rows = chosen.map(key => {
      const a = AGENTS[key];
      return `<div class="agent" data-key="${key}" data-st="queued" style="--ac:var(${a.ac});--act:var(${a.act})">
          <div style="position:relative">
            <div class="a-node">${SVG(a.icon, 1.7)}</div>
            <span class="a-conn"></span>
          </div>
          <div>
            <div class="a-row">
              <span class="a-name">${a.name}</span>
              <span class="a-tool">${a.tool}</span>
              <span class="a-chip"><span class="cdot"></span><span class="ct">Queued</span></span>
            </div>
            <div class="a-detail"></div>
            <div class="a-time"></div>
          </div>
        </div>`;
    }).join("");

    const card = elFromHTML(`
      <div class="run reveal-up">
        <div class="run-head">
          <span class="rh-ico">${SVG(ICON.orch, 1.7)}</span>
          <div><div class="rh-title">Orchestrator Agent</div><div class="rh-sub">Routing your request across the agent network</div></div>
          <span class="rh-status"><span class="rh-spin"></span><span class="rs-txt">analyzing…</span></span>
        </div>
        <div class="orch-think">
          <span class="ot-ico">${SVG('<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>', 1.7)}</span>
          <span class="ot-txt"></span>
        </div>
        <div class="agents">${rows}</div>
        <div class="run-foot" style="display:none">
          <span class="done-ico">${SVG('<path d="M20 6 9 17l-5-5"/>', 2.4)}</span>
          <span class="rf-txt">All agents completed.</span>
          <button class="rf-open" type="button">Open in workspace ${SVG('<path d="M5 12h14M13 6l6 6-6 6"/>')}</button>
        </div>
      </div>`);
    $("#thread").appendChild(card);
    return card;
  }

  // ---------- backend ----------
  async function callBackend(text) {
    const headers = { "Content-Type": "application/json" };
    const jwt = getJWT(); if (jwt) headers["Authorization"] = "Bearer " + jwt;
    abortController = new AbortController();
    const resp = await fetch("/chat", {
      method: "POST", headers, signal: abortController.signal,
      body: JSON.stringify({ message: text, session_id: SESSION_ID }),
    });
    if (!resp.ok) throw new Error("Server error " + resp.status);
    const data = await resp.json();
    if (!data.ok) throw new Error(data.response || "Unknown backend error");
    return data.response;
  }

  // ---------- doc workspace ----------
  function resetDocPanel() {
    const docScroll = $("#docScroll");
    docScroll.innerHTML = `
      <div class="doc-empty" id="docEmpty">
        <div class="de-art"></div>
        <h3>Your manuscript will appear here</h3>
        <p>Start a conversation and the agents will assemble a complete paper — abstract, sections, figures, and references — live in this panel.</p>
      </div>`;
    $("#btnDownload").disabled = true;
    $("#btnCopy").disabled = true;
    currentPaper = null;
  }

  function renderRealMarkdown(markdown, fallbackTitle) {
    const docEmpty = $("#docEmpty");
    if (docEmpty) docEmpty.style.display = "none";
    const wrap = $("#docScroll");
    const html = typeof marked !== "undefined"
      ? marked.parse(markdown)
      : `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHTML(markdown)}</pre>`;
    const titleMatch = markdown.match(/^#\s+(.+)$/m);
    const title = (titleMatch ? titleMatch[1] : fallbackTitle) || "Untitled Paper";
    const scoreMatch = markdown.match(/humanization score[:\s]*(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : "—";
    const words = markdown.split(/\s+/).filter(Boolean).length;
    wrap.innerHTML = `
      <article class="paper reveal-up" id="paperEl">
        <div class="paper-meta" style="margin-bottom:20px">
          <span class="pm score">${SVG('<path d="M20 6 9 17l-5-5"/>', 2.4)} <b>${score}</b>/100 humanized</span>
          <span class="pm">${SVG('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>', 1.8)} ${words.toLocaleString()} words</span>
        </div>
        <div class="real-paper">${html}</div>
      </article>`;
    wrap.scrollTop = 0;
    $("#btnDownload").disabled = false;
    $("#btnCopy").disabled = false;
    currentPaper = { markdown, title };
  }

  async function typeInto(el, text, speed = 14) {
    el.innerHTML = "";
    for (let i = 0; i < text.length; i++) {
      el.textContent = text.slice(0, i + 1);
      if (i % 2 === 0) await wait(speed);
    }
  }
  async function typeHTML(el, html, speed = 9) {
    const tmp = document.createElement("div"); tmp.innerHTML = html;
    const plain = tmp.textContent;
    el.innerHTML = `<span class="tt"></span><span class="cursor">▍</span>`;
    const tt = el.querySelector(".tt");
    for (let i = 0; i < plain.length; i++) { tt.textContent = plain.slice(0, i + 1); if (i % 2 === 0) await wait(speed); }
    el.innerHTML = html;
  }

  // ---------- main pipeline ----------
  async function runPipeline(text, forced) {
    if (running) return;
    running = true;
    setComposerEnabled(false);

    // clear doc panel and start fresh
    resetDocPanel();

    const w = $("#welcome"); if (w) w.remove();
    addUserMessage(text);
    await wait(180);

    const { chosen, reason } = route(text, forced);
    const card = buildRunCard(chosen, reason);
    scrollThread();

    await wait(420);
    await typeHTML(card.querySelector(".ot-txt"), reason, 7);
    card.querySelector(".rs-txt").textContent = `routing to ${chosen.length} agent${chosen.length > 1 ? "s" : ""}`;
    await wait(350);

    const topicLabel = text.length > 60 ? text.slice(0, 57) + "…" : text;

    // fire real backend call NOW in parallel with animations
    const apiPromise = callBackend(text).catch(err => ({ __error: err.message }));

    for (const key of chosen) {
      const a = AGENTS[key];
      const row = card.querySelector(`.agent[data-key="${key}"]`);
      const chip = row.querySelector(".ct");
      const detail = row.querySelector(".a-detail");
      const timeEl = row.querySelector(".a-time");

      row.dataset.st = "active";
      chip.textContent = "Working";
      scrollThread();

      const t0 = performance.now();
      for (const line of a.work) {
        await typeInto(detail, line, 9);
        detail.innerHTML = `<span class="tt">${line}</span> <span class="cursor">▍</span>`;
        await wait(360 + Math.random() * 260);
      }
      const ms = Math.round(680 + Math.random() * 900);

      row.dataset.st = "done";
      chip.textContent = "Done";
      detail.innerHTML = key === "research"
        ? a.done(escapeHTML(topicLabel))
        : a.done();
      timeEl.textContent = `completed in ${(ms / 1000).toFixed(1)}s`;
      scrollThread();
      await wait(220);
    }

    card.querySelector(".rh-status").innerHTML =
      `<span style="color:var(--ink-3);font-size:12px"><span class="rh-spin"></span> finalizing…</span>`;

    // Prominent "still generating" banner while backend assembles the paper
    const waitBanner = document.createElement("div");
    waitBanner.className = "wait-banner";
    waitBanner.innerHTML = `
      <span class="wb-spin"></span>
      <span class="wb-msg">Assembling manuscript — LLM is still generating the full paper. This can take 1–3 min…</span>`;
    card.querySelector(".agents").after(waitBanner);
    scrollThread();

    let realResponse;
    try { realResponse = await apiPromise; } catch(e) {
      if (e.name === "AbortError") {
        waitBanner.remove();
        card.querySelector(".rh-status").innerHTML = `<span style="color:var(--ink-3);font-weight:600">⏹ stopped</span>`;
        asstMessage(`<p style="color:var(--ink-3)">Generation stopped. Start a new message to try again.</p>`);
        setComposerEnabled(true); running = false; return;
      }
      realResponse = { __error: e.message };
    }
    waitBanner.remove();
    const hasRealContent = realResponse && typeof realResponse === "string";
    const backendErr = realResponse && realResponse.__error;

    if (hasRealContent) {
      const verb = chosen.length === 1 ? "edited" : chosen.length === 2 ? "written and edited" : "researched, written, and edited";
      const titleMatch = realResponse.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : topicLabel;

      card.querySelector(".rh-status").innerHTML =
        `<span style="color:var(--good);font-weight:600">✓ complete</span>`;
      const foot = card.querySelector(".run-foot");
      foot.style.display = "flex";
      foot.querySelector(".rf-open").addEventListener("click", () => openDoc());

      renderRealMarkdown(realResponse, topicLabel);
      openDoc();
      saveToHistory(title, verb.split(" ").pop(), realResponse);
      asstMessage(
        `<p>Done — I've <strong>${verb}</strong> your paper using live AI agents.</p>
         <p><strong>${escapeHTML(title)}</strong> — real research from arXiv, written and edited by Gemini. Open it in the workspace or download as Markdown.</p>
         <p style="color:var(--ink-3);font-size:13px">Ask a follow-up to refine any section.</p>`
      );
    } else {
      card.querySelector(".rh-status").innerHTML =
        `<span style="color:#c0392b;font-weight:600">⚠ error</span>`;
      const errDetail = backendErr || "Backend unavailable";
      asstMessage(
        `<p style="color:var(--ink-2)">The agents could not complete this request.</p>
         <p style="font-size:12.5px;color:#c0392b;background:#fdf2f2;padding:8px 12px;border-radius:7px;margin:6px 0">${escapeHTML(errDetail)}</p>
         <p style="font-size:13px;color:var(--ink-3)">Make sure the server is running and the Google API key has billing enabled, then try again.</p>`
      );
    }
    persist();
    setComposerEnabled(true);
    running = false;
  }

  // ---------- open doc panel ----------
  function openDoc() {
    $(".doc").classList.add("open");
    if (window.innerWidth >= 860) {
      const paper = $("#paperEl");
      if (paper) {
        paper.scrollIntoView({ behavior: "smooth", block: "start" });
        paper.style.transition = "box-shadow .15s";
        paper.style.boxShadow = "0 0 0 3px var(--indigo)";
        setTimeout(() => { paper.style.boxShadow = ""; }, 600);
      }
    }
  }

  // ---------- composer ----------
  function setComposerEnabled(on) {
    $("#sendBtn").disabled = !on;
    $("#input").disabled = !on;
    $("#sendBtn").style.display = on ? "" : "none";
    const sb = $("#stopBtn"); if (sb) sb.style.display = on ? "none" : "flex";
    if (on) $("#input").focus();
  }

  function stopPipeline() {
    if (abortController) abortController.abort();
    abortController = null;
  }

  function submit() {
    const inp = $("#input");
    const text = inp.value.trim();
    if (!text || running) return;
    inp.value = "";
    inp.style.height = "auto";
    runPipeline(text, mode);
  }

  // ---------- session memory ----------
  function persist() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ messages, mode }));
    } catch (e) {}
  }

  async function saveToHistory(title, modeTag, markdown) {
    // Save to backend if logged in
    const jwt = getJWT();
    if (jwt) {
      try {
        await fetch("/papers", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + jwt },
          body: JSON.stringify({ title, mode: modeTag, markdown }),
        });
      } catch(e) {}
    }
    // Always keep a local copy as fallback
    try {
      let hist = [];
      try { hist = JSON.parse(localStorage.getItem(HISTORY_STORE) || "[]"); } catch(e) {}
      hist = hist.filter(h => h.title !== title);
      hist.unshift({ title, modeTag, markdown, ts: Date.now() });
      if (hist.length > 20) hist = hist.slice(0, 20);
      localStorage.setItem(HISTORY_STORE, JSON.stringify(hist));
    } catch(e) {}
    renderRail();
  }

  async function renderRail() {
    const rail = $("#railScroll"); if (!rail) return;
    let hist = [];

    const jwt = getJWT();
    if (jwt) {
      try {
        const resp = await fetch("/papers", { headers: { "Authorization": "Bearer " + jwt } });
        if (resp.ok) {
          const data = await resp.json();
          hist = data.papers.map(p => ({
            id: p.id, title: p.title, modeTag: p.mode,
            markdown: p.markdown, ts: new Date(p.created_at).getTime(),
          }));
        }
      } catch(e) {}
    }

    if (!hist.length) {
      try { hist = JSON.parse(localStorage.getItem(HISTORY_STORE) || "[]"); } catch(e) {}
    }

    const hint = $("#railEmptyHint");
    if (!hist.length) { if (hint) hint.style.display = ""; return; }
    if (hint) hint.style.display = "none";

    const now = Date.now(), msDay = 86400000;
    function dayLabel(ts) {
      const age = now - ts;
      if (age < msDay) return "Today";
      if (age < 2 * msDay) return "Yesterday";
      return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    const groups = {};
    hist.forEach(h => {
      const l = dayLabel(h.ts);
      if (!groups[l]) groups[l] = [];
      groups[l].push(h);
    });

    Array.from(rail.children).forEach(c => { if (c.id !== "railEmptyHint") c.remove(); });

    Object.entries(groups).forEach(([groupLabel, items]) => {
      const gl = document.createElement("div");
      gl.className = "rail-group-label";
      gl.textContent = groupLabel;
      rail.appendChild(gl);

      items.forEach(h => {
        const btn = document.createElement("button");
        btn.className = "session";
        btn.type = "button";
        btn.innerHTML = `<div class="s-title">${escapeHTML(h.title)}</div>
          <div class="s-meta">${dayLabel(h.ts)} <span class="s-tag">${escapeHTML(h.modeTag || "edited")}</span></div>`;
        btn.addEventListener("click", () => {
          $$(".session").forEach(s => s.classList.remove("active"));
          btn.classList.add("active");
          if (h.markdown) { renderRealMarkdown(h.markdown, h.title); openDoc(); }
        });
        rail.appendChild(btn);
      });
    });
  }

  function restore() {
    let raw; try { raw = localStorage.getItem(STORE); } catch (e) { return false; }
    if (!raw) return false;
    let s; try { s = JSON.parse(raw); } catch (e) { return false; }
    if (!s.messages || !s.messages.length) return false;

    const w = $("#welcome"); if (w) w.remove();
    messages = s.messages;
    const thread = $("#thread");
    messages.forEach(m => {
      const el = elFromHTML(m.html.replace(/reveal-up/g, ""));
      thread.appendChild(el);
    });
    if (s.mode) setMode(s.mode);
    scrollThread();
    return true;
  }

  // ---------- mode pills ----------
  function setMode(m) {
    mode = m;
    $$(".mode-pill").forEach(p => p.classList.toggle("active", p.dataset.mode === m));
  }

  // ---------- download / copy ----------
  function download() {
    if (!currentPaper || !currentPaper.markdown) return;
    const blob = new Blob([currentPaper.markdown], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = slug(currentPaper.title || "paper") + ".md";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Downloaded " + a.download);
  }

  async function copyMd() {
    if (!currentPaper || !currentPaper.markdown) return;
    try { await navigator.clipboard.writeText(currentPaper.markdown); toast("Markdown copied to clipboard"); }
    catch (e) { toast("Copy unavailable in this view"); }
  }

  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60); }

  // ---------- helpers ----------
  function escapeHTML(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function toast(msg) {
    const t = $("#toast"); t.querySelector(".tmsg").textContent = msg;
    t.classList.add("show"); clearTimeout(t._tm);
    t._tm = setTimeout(() => t.classList.remove("show"), 3000);
  }

  // ---------- wire up ----------
  document.addEventListener("DOMContentLoaded", () => {
    const inp = $("#input");
    inp.addEventListener("input", () => { inp.style.height = "auto"; inp.style.height = Math.min(inp.scrollHeight, 168) + "px"; });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } });
    $("#sendBtn").addEventListener("click", submit);

    $$(".mode-pill").forEach(p => p.addEventListener("click", () => setMode(p.dataset.mode)));

    $$(".flow").forEach(f => f.addEventListener("click", () => {
      setMode(f.dataset.mode);
      inp.value = f.dataset.prompt;
      inp.dispatchEvent(new Event("input"));
      inp.focus();
    }));

    $("#btnDownload").addEventListener("click", download);
    $("#btnCopy").addEventListener("click", copyMd);
    $("#stopBtn") && $("#stopBtn").addEventListener("click", stopPipeline);

    // New Paper — clear everything and reload
    $("#newBtn").addEventListener("click", () => {
      if (running) return;
      try { localStorage.removeItem(STORE); } catch (e) {}
      location.reload();
    });

    // auth modal tabs
    $("#tabLogin")  && $("#tabLogin").addEventListener("click",  () => setAuthTab("login"));
    $("#tabSignup") && $("#tabSignup").addEventListener("click", () => setAuthTab("signup"));
    $("#authModalClose") && $("#authModalClose").addEventListener("click", closeAuthModal);
    $("#authBackdrop") && $("#authBackdrop").addEventListener("click", (e) => {
      if (e.target === $("#authBackdrop")) closeAuthModal();
    });

    // responsive rail
    $("#railToggle") && $("#railToggle").addEventListener("click", () => {
      $(".rail").classList.toggle("open"); $("#scrim").classList.toggle("show");
    });
    $("#scrim") && $("#scrim").addEventListener("click", () => {
      $(".rail").classList.remove("open"); $("#scrim").classList.remove("show");
    });
    $("#docBack") && $("#docBack").addEventListener("click", () => $(".doc").classList.remove("open"));

    updateRailAuth();
    renderRail();
    restore();
    setComposerEnabled(true);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { document.documentElement.classList.remove("preanim"); });
    });
    setTimeout(function () {
      document.documentElement.classList.remove("preanim");
      document.documentElement.classList.add("anim-done");
    }, 950);
  });
})();
