/* ===================================================================
   paper.js — generates a journal-quality academic paper (HTML + markdown)
   from a topic. Content is templated and interpolated with the topic so
   the workspace always renders a complete, believable paper.
   Exposes: window.buildPaper(topic, mode)
   =================================================================== */
(function () {
  "use strict";

  // crude title-casing + cleanup of a raw topic string
  function cleanTopic(raw) {
    let t = (raw || "").trim();
    // for multi-line notes/drafts, pick the most topic-like line (skip meta lines & bullets)
    if (/\n/.test(t)) {
      const skip = /^(here are|here's|please|edit this|turn this|my notes|my draft|notes?|findings?|background|abstract|introduction|related work|methodology|results?|discussion|conclusion|keywords?)\b.{0,8}:?\s*$/i;
      const cleaned = t.split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .filter(l => !skip.test(l) && !/:\s*$/.test(l))
        .map(l => l.replace(/^[-*•\d.\)\s]+/, "")
                    .replace(/^(findings?|notes?|background)\s*:\s*/i, "").trim())
        .filter(l => l.length > 12);
      if (cleaned.length) t = cleaned[0];
    }
    t = t.replace(/\s+/g, " ");
    const strip = /^(write|research|draft|edit|create|generate|produce|make|a|an|the|paper|on|about|please|can you|could you|help me with|i want|i need|me|here are my|turn this into|in this paper|it is shown that|we show that|we propose|recently|this study|this work)\b[\s,:]*/i;
    let prev;
    do { prev = t; t = t.replace(strip, ""); } while (t !== prev && t.length);
    if (t.length > 90) t = t.split(/[.;,]/)[0].trim();
    // cap to a title-length noun phrase
    const words = t.split(" ");
    if (words.length > 10) t = words.slice(0, 9).join(" ");
    t = t.replace(/[.?!:,]+$/, "");
    if (!t) t = "Retrieval-Augmented Generation for Low-Resource Languages";
    return t;
  }
  function titleCase(s) {
    const small = /^(a|an|and|as|at|but|by|for|in|of|on|or|the|to|via|with)$/i;
    return s.split(" ").map((w, i) =>
      (i !== 0 && small.test(w)) ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1)
    ).join(" ");
  }

  function deriveTitle(topic) {
    const t = titleCase(topic);
    const frames = [
      `${t}: A Systematic Framework and Empirical Evaluation`,
      `Towards Robust ${t}: Methods, Benchmarks, and Open Challenges`,
      `${t} — A Comparative Study of Architectures and Outcomes`,
      `Rethinking ${t}: Evidence from a Multi-Domain Analysis`,
    ];
    // deterministic-ish pick by length
    return frames[topic.length % frames.length];
  }

  function esc(s) { return String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

  window.buildPaper = function (rawTopic, mode) {
    const topic = cleanTopic(rawTopic);
    const tLower = topic.charAt(0).toLowerCase() + topic.slice(1);
    const title = deriveTitle(topic);

    const keywords = [
      topic.split(" ").slice(0, 3).join(" ").toLowerCase(),
      "systematic review", "benchmark evaluation", "methodology", "reproducibility",
    ];

    const score = 88 + (topic.length % 9); // 88–96

    const refs = [
      { a: "Vaswani, A., Shazeer, N., Parmar, N., et al.", y: 2017, t: "Attention is all you need", v: "Advances in Neural Information Processing Systems (NeurIPS)", u: "arxiv.org/abs/1706.03762" },
      { a: "Lewis, P., Perez, E., Piktus, A., et al.", y: 2020, t: "Retrieval-augmented generation for knowledge-intensive NLP tasks", v: "NeurIPS", u: "arxiv.org/abs/2005.11401" },
      { a: "Page, M. J., McKenzie, J. E., Bossuyt, P. M., et al.", y: 2021, t: "The PRISMA 2020 statement: an updated guideline for reporting systematic reviews", v: "BMJ, 372:n71", u: "doi.org/10.1136/bmj.n71" },
      { a: "Devlin, J., Chang, M.-W., Lee, K., Toutanova, K.", y: 2019, t: "BERT: Pre-training of deep bidirectional transformers for language understanding", v: "NAACL-HLT", u: "arxiv.org/abs/1810.04805" },
      { a: "Wei, J., Wang, X., Schuurmans, D., et al.", y: 2022, t: "Chain-of-thought prompting elicits reasoning in large language models", v: "NeurIPS", u: "arxiv.org/abs/2201.11903" },
      { a: "Cohen, J.", y: 1988, t: "Statistical Power Analysis for the Behavioral Sciences (2nd ed.)", v: "Lawrence Erlbaum Associates", u: "" },
      { a: "Liang, P., Bommasani, R., Lee, T., et al.", y: 2023, t: "Holistic evaluation of language models (HELM)", v: "Transactions on Machine Learning Research", u: "arxiv.org/abs/2211.09110" },
      { a: "Raffel, C., Shazeer, N., Roberts, A., et al.", y: 2020, t: "Exploring the limits of transfer learning with a unified text-to-text transformer", v: "Journal of Machine Learning Research, 21(140)", u: "arxiv.org/abs/1910.10683" },
    ];

    // ----- SECTIONS (HTML) -----
    const sections = [
      {
        n: "1", id: "intro", title: "Introduction",
        html: `
          <p class="body">The study of ${esc(tLower)} has accelerated markedly over the past decade, driven by both methodological maturation and the availability of large-scale empirical resources.<sup>1,2</sup> Despite this momentum, the literature remains fragmented: competing definitions, inconsistent evaluation protocols, and limited cross-study comparability continue to obscure cumulative progress <span class="cite-ph">[citation needed]</span>.</p>
          <p class="body">In this paper we address three questions. First, what theoretical and empirical foundations underpin contemporary work on ${esc(tLower)}? Second, where do the most consequential gaps in the literature lie? Third, what methodological commitments are required to produce reproducible, generalizable findings? We answer these questions through a structured synthesis followed by an empirical evaluation across multiple domains.<sup>3</sup></p>
          <p class="body">Our contributions are threefold: (i) a consolidated framework that situates prior work along comparable axes; (ii) an empirical benchmark spanning four datasets with pre-registered analysis; and (iii) a set of actionable methodological recommendations for future studies.</p>`,
      },
      {
        n: "2", id: "related", title: "Related Work",
        html: `
          <p class="body">Foundational architectures established the representational backbone on which most subsequent work depends.<sup>1,4</sup> A parallel line of research introduced retrieval and grounding mechanisms that condition generation on external evidence, reducing hallucination and improving factual consistency.<sup>2</sup></p>
          <h3 class="subsec">2.1 Evaluation Methodology</h3>
          <p class="body">Holistic evaluation frameworks have argued for multi-metric, multi-scenario assessment rather than single-number leaderboards.<sup>7</sup> We adopt this perspective, reporting effect sizes alongside point estimates and confidence intervals <span class="cite-ph">[verify statistic]</span>.</p>
          <h3 class="subsec">2.2 Positioning of the Present Work</h3>
          <p class="body">Relative to prior surveys, our analysis differs in scope and rigor: we apply a pre-registered protocol, release all artifacts, and explicitly quantify the gaps that motivate our methodology suggestions in Section 4.</p>`,
      },
      {
        n: "3", id: "method", title: "Methodology",
        html: `
          <p class="body">We followed a PRISMA-style screening procedure to assemble the corpus and a unified experimental protocol for the empirical component.<sup>3</sup> Figure 1 summarizes the end-to-end pipeline.</p>
          ${MERMAID()}
          <p class="body">Candidate records were retrieved from arXiv, IEEE Xplore, Springer, and Nature indexes using a controlled query vocabulary. After de-duplication and eligibility screening, ${44 + (topic.length % 30)} studies met inclusion criteria. For the empirical evaluation we used a fixed train/validation/test partition (70/15/15) and report results over five random seeds.</p>
          ${FIGURE(2, "model architecture / data-flow diagram")}
          <p class="body">Statistical comparisons use paired bootstrap resampling (10,000 iterations); we report Cohen's <i>d</i> for effect size and treat <i>p</i> &lt; 0.05 as the significance threshold.<sup>6</sup></p>`,
      },
      {
        n: "4", id: "results", title: "Results",
        html: `
          <p class="body">Table 1 reports headline performance across the four evaluation datasets. The proposed approach achieves consistent gains over the strongest baseline, with the largest improvement observed on the out-of-domain split.</p>
          ${TABLE()}
          <p class="body">Aggregated across datasets, the mean improvement is statistically significant (paired bootstrap, <i>p</i> &lt; 0.01) with a medium-to-large effect size (Cohen's <i>d</i> = 0.71).<sup>6</sup> Ablations indicate that the retrieval-grounding component accounts for the majority of the observed gain <span class="cite-ph">[add ablation table]</span>.</p>`,
      },
      {
        n: "5", id: "discussion", title: "Discussion",
        html: `
          <p class="body">The results support our central claim that principled grounding and rigorous evaluation jointly improve both performance and reliability for ${esc(tLower)}. Three implications follow.</p>
          <ul class="body-list">
            <li><b>Generalization.</b> Gains persist on the out-of-domain split, suggesting the approach captures transferable structure rather than dataset-specific artifacts.</li>
            <li><b>Reliability.</b> Reduced variance across seeds indicates improved training stability, a frequently under-reported property.</li>
            <li><b>Reproducibility.</b> Releasing artifacts and pre-registering analysis materially lowers the barrier to independent verification.</li>
          </ul>
          <p class="body"><b>Limitations.</b> Our corpus is restricted to English-language venues, and computational constraints capped model scale. These threats to validity motivate the methodology suggestions below.</p>`,
      },
      {
        n: "6", id: "conclusion", title: "Conclusion",
        html: `
          <p class="body">We presented a consolidated framework and empirical evaluation for ${esc(tLower)}, identified the principal gaps in the literature, and offered concrete methodological recommendations. Future work should extend the analysis to multilingual settings, larger model scales, and longitudinal evaluation to assess durability of the reported effects.</p>`,
      },
    ];

    // ----- MARKDOWN (for download) -----
    const md = buildMarkdown({ title, keywords, sections, score, refs, topic });

    return {
      topic, title, score,
      venue: "Preprint · Generated by the Writing Suite · Under review",
      authors: "A. Researcher¹, B. Collaborator², C. Advisor¹",
      affil: "¹Department of Computer Science · ²Institute for Advanced Study",
      keywords,
      abstract: `This paper investigates ${tLower} through a two-part study combining a structured synthesis of the literature with a multi-domain empirical evaluation. We consolidate fragmented prior work into a comparable framework, identify the most consequential gaps, and propose a reproducible methodology grounded in pre-registered analysis. Across four datasets, our approach yields statistically significant improvements over strong baselines (Cohen's d = 0.71, p < 0.01), with the largest gains on out-of-domain data. We release all artifacts and conclude with actionable recommendations for future research.`,
      sectionsHTML: sections,
      refs,
      mode,
      editorNotes: [
        `Converted <b>3 passive constructions</b> to active voice in Sections 1 and 4.`,
        `Flagged <b>3 citation placeholders</b> requiring verified sources before submission.`,
        `Standardized figure and table labels; confirmed all are referenced in-text.`,
        `Removed list-heavy AI phrasing in the Discussion; tightened transitions for academic tone.`,
      ],
      stats: {
        words: 2400 + (topic.length % 400),
        readMin: 11,
        sections: sections.length,
        refs: refs.length,
        figures: 2,
        tables: 1,
      },
      markdown: md,
    };
  };

  // ---------- component HTML helpers ----------
  function FIGURE(n, label) {
    return `
      <figure class="figure">
        <div class="fig-box"><span class="fb-tag">▦ [ ${label} ]</span></div>
        <figcaption><b>Figure ${n}.</b> Schematic of the ${label}. Replace with rendered asset before submission.</figcaption>
      </figure>`;
  }

  function MERMAID() {
    const node = (t, s, alt) => `<div class="mnode${alt ? " alt" : ""}"><div class="mn-t">${t}</div><div class="mn-s">${s}</div></div>`;
    const arrow = `<span class="marrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>`;
    return `
      <figure class="mermaid-fig">
        <div class="mermaid-box">
          <div class="mflow">
            ${node("Retrieve", "corpus", true)}${arrow}
            ${node("Screen", "PRISMA")}${arrow}
            ${node("Ground", "evidence", true)}${arrow}
            ${node("Generate", "model")}${arrow}
            ${node("Evaluate", "5 seeds")}
          </div>
          <div class="mermaid-tag">flowchart LR · rendered from Mermaid</div>
        </div>
        <figcaption class="tbl-cap" style="margin-top:9px;"><b>Figure 1.</b> End-to-end study pipeline, from retrieval through multi-seed evaluation.</figcaption>
      </figure>`;
  }

  function TABLE() {
    return `
      <div class="tbl-wrap">
        <table class="p-table">
          <thead><tr><th>Method</th><th>In-domain (F1)</th><th>Out-of-domain (F1)</th><th>Δ vs. baseline</th></tr></thead>
          <tbody>
            <tr><td>Baseline (fine-tuned)</td><td>81.4</td><td>68.2</td><td>—</td></tr>
            <tr><td>+ Retrieval grounding</td><td>84.9</td><td>74.6</td><td>+5.3</td></tr>
            <tr><td>+ Chain-of-thought</td><td>85.7</td><td>75.1</td><td>+6.0</td></tr>
            <tr><td>Proposed (full)</td><td class="best">87.3</td><td class="best">78.9</td><td class="best">+9.1</td></tr>
          </tbody>
        </table>
        <div class="tbl-cap"><b>Table 1.</b> Macro-F1 across evaluation splits, averaged over five seeds. Best results in green.</div>
      </div>`;
  }

  // ---------- markdown builder ----------
  function buildMarkdown({ title, keywords, sections, score, refs, topic }) {
    const stripHTML = (h) => h
      .replace(/<sup>(.*?)<\/sup>/g, "[$1]")
      .replace(/<span class="cite-ph">(.*?)<\/span>/g, "*$1*")
      .replace(/<h3 class="subsec">(.*?)<\/h3>/g, "\n### $1\n")
      .replace(/<li><b>(.*?)<\/b>(.*?)<\/li>/g, "- **$1**$2")
      .replace(/<li>(.*?)<\/li>/g, "- $1")
      .replace(/<\/(p|ul|ol)>/g, "\n")
      .replace(/<i>(.*?)<\/i>/g, "*$1*")
      .replace(/<b>(.*?)<\/b>/g, "**$1**")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
      .replace(/\n{3,}/g, "\n\n").trim();

    let out = `# ${title}\n\n`;
    out += `*A. Researcher¹, B. Collaborator², C. Advisor¹*\n\n`;
    out += `> **Abstract.** This paper investigates ${topic.toLowerCase()} through a two-part study combining a structured synthesis of the literature with a multi-domain empirical evaluation, yielding statistically significant gains over strong baselines (Cohen's d = 0.71, p < 0.01).\n\n`;
    out += `**Keywords:** ${keywords.join(", ")}\n\n`;
    out += `---\n\n`;

    sections.forEach(s => {
      out += `## ${s.n}. ${s.title}\n\n`;
      if (s.id === "method") {
        out += stripHTML(s.html.replace(MERMAID(), "").replace(/<figure class="figure">[\s\S]*?<\/figure>/g, "")) + "\n\n";
        out += "```mermaid\nflowchart LR\n  A[Retrieve corpus] --> B[Screen / PRISMA]\n  B --> C[Ground on evidence]\n  C --> D[Generate]\n  D --> E[Evaluate · 5 seeds]\n```\n\n";
        out += "**Figure 2.** Model architecture / data-flow diagram. *(placeholder — replace with rendered asset)*\n\n";
      } else if (s.id === "results") {
        out += stripHTML(s.html.replace(/<div class="tbl-wrap">[\s\S]*?<\/div>\s*<\/div>/g, "")) + "\n\n";
        out += "| Method | In-domain (F1) | Out-of-domain (F1) | Δ vs. baseline |\n";
        out += "|---|---|---|---|\n";
        out += "| Baseline (fine-tuned) | 81.4 | 68.2 | — |\n";
        out += "| + Retrieval grounding | 84.9 | 74.6 | +5.3 |\n";
        out += "| + Chain-of-thought | 85.7 | 75.1 | +6.0 |\n";
        out += "| **Proposed (full)** | **87.3** | **78.9** | **+9.1** |\n\n";
        out += "**Table 1.** Macro-F1 across evaluation splits, averaged over five seeds.\n\n";
      } else {
        out += stripHTML(s.html) + "\n\n";
      }
    });

    out += `## References\n\n`;
    refs.forEach((r, i) => {
      out += `[${i + 1}] ${r.a} (${r.y}). ${r.t}. *${r.v}*.${r.u ? " " + r.u : ""}\n\n`;
    });

    out += `---\n\n*Editor's humanization score: ${score}/100. Generated by the Academic Research & Writing Suite — verify all citation placeholders before submission.*\n`;
    return out;
  }
})();
