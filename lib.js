// Study Desk: the page's pure logic. Loaded by index.html as a plain script
// (globalThis.CatchupLib) and by lib.test.mjs through require().
(function (root) {
  "use strict";

  const RULES = [
    "You are helping an economics PhD student close a gap in, or learn, a technical concept from one of their courses.",
    "- Every answer has two parts, each under a short heading. First \"Intuition\": a simple explanation in plain words, what the idea is for and why it works, with as little notation as possible. Then \"In depth\": the precise treatment at PhD level, with definitions, the key steps or proof, and one concrete example where it helps. Do not pad. The one exception: when you ask a quiz question, ask only the question.",
    "- Never leave math unexplained. Every equation, condition, assumption or claim you write, in either part, comes with a plain-words sentence right next to it: what it says (read it aloud in words), why it is needed or what goes wrong without it, and how it connects to the result. Example: after $\\int_0^y [F_B(x) - F_A(x)]\\,dx \\ge 0$ for all $y$, say that it adds up, from the bottom to each cutoff $y$, how much more likely $B$ is than $A$ to land below each point; staying non-negative means $B$ never falls behind in piling up bad outcomes, so (with equal means) $B$ is the riskier one, a mean-preserving spread of $A$. An equation the reader has to decode alone is a bug.",
    "- When course material is attached below, ground the answer in it: use the lecturer's notation and refer to slides by number (for example \"Lecture 4, slide 15\").",
    "- If the attached material does not cover what is asked, say so plainly and answer from general knowledge. Never invent what a slide says.",
    "- Whiteboard files were transcribed from handwriting and may contain errors. Flag anything in them that looks wrong.",
    "- Write all math in LaTeX: inline $...$, display $$...$$. Use Markdown for structure. No preamble and no closing summary.",
    "- When a picture helps (two curves crossing, the shape of a function, a shift in comparative statics), draw it: a fenced code block with language `plot` holding JSON, for example",
    "```plot",
    "{\"x\": [0, 1], \"xlabel\": \"w̄\", \"param\": {\"name\": \"b\", \"from\": 0, \"to\": 0.8, \"value\": 0.2}, \"curves\": [{\"f\": \"x - b\", \"label\": \"$h_1(\\\\bar w) = \\\\bar w - b$\"}, {\"f\": \"0.9/(1-0.9) * (1-x)^2 / 2\", \"label\": \"$h_2(\\\\bar w)$\"}], \"vlines\": [{\"x\": \"b\", \"label\": \"b\"}]}",
    "```",
    "  Functions are in x, in math.js syntax (^, exp, log, sqrt, erf, a ? b : c); for something with no closed form give \"points\": [[x, y], ...] instead of \"f\". Optional: \"y\": [lo, hi], \"ylabel\", \"marks\": [{\"x\", \"y\", \"label\"}]. At most 4 curves. To show how something moves with a parameter (comparative statics), add \"param\": the page gives the student a slider and a Play button; use its name in \"f\", and as a string in a line's or mark's \"x\"/\"y\" (\"x\": \"b\"). Curve labels may use $LaTeX$ (double the backslashes: it is JSON); axis, line and mark labels are plain text. Pick numbers that make the picture clear and say they are illustrative. Add a mark only where you know its exact coordinates.",
    "- If a read_slides tool is available, use it to open other course files listed under \"Other material\" when they would help. Do not narrate tool use (no \"let me open slide 10\"): open what you need, then answer.",
    "- Tool calls from earlier answers are not shown in this chat, but the slides they opened are included under \"Attached course material\". Trust the slide references in earlier answers. Do not re-check, retract or apologise for earlier answers unless the student asks; if you spot a real error in one, correct it in one sentence.",
  ].join("\n");

  // Added to RULES when the Concise button is used.
  const CONCISE = "- The student asked for concise answers: about a third of the usual length. Keep \"Intuition\" in full, and draw a plot whenever a picture helps. Cut \"In depth\" to the key definition or equation and the one or two steps that matter, each still with its one-line plain-words meaning. No worked example unless asked.";

  // Slides opened with read_slides in earlier answers, added after the attached sources (exact duplicates dropped).
  // ponytail: overlapping ranges are sent twice; merge ranges if prompts get too big
  function withReads(sources, reads) {
    const key = (s) => s.file + "|" + (s.from ?? "") + "|" + (s.to ?? "");
    const seen = new Set((sources || []).map(key)), out = [...(sources || [])];
    for (const r of reads || []) if (r && r.file && !seen.has(key(r))) { seen.add(key(r)); out.push({ file: r.file, from: r.from, to: r.to, read: true }); }
    return out;
  }

  const HEADING = /^## (?:Slide|Page) (\d+)(?: — (.*))?$/gm;
  const bytes = (s) => new TextEncoder().encode(s).length;

  function splitSections(md) {
    const heads = [...md.matchAll(HEADING)];
    return heads.map((m, i) => ({
      n: Number(m[1]),
      title: m[2] || "",
      heading: m[0],
      text: md.slice(m.index + m[0].length, i + 1 < heads.length ? heads[i + 1].index : md.length).trim(),
    }));
  }

  // Whole body when no range is given; "" when the range matches nothing.
  function sliceSections(md, from, to) {
    if (from == null && to == null) return md.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
    const lo = from == null ? -Infinity : Number(from), hi = to == null ? Infinity : Number(to);
    return splitSections(md).filter((s) => s.n >= lo && s.n <= hi).map((s) => s.heading + "\n" + s.text).join("\n\n");
  }

  function resolveSources(sources, index) {
    const byId = new Map(index.files.map((f) => [f.id, f]));
    const found = [], missing = [];
    for (const s of sources || []) {
      const f = byId.get(s.file);
      if (f) found.push({ ...s, title: f.title }); else missing.push(s.file);
    }
    return { found, missing };
  }

  // The concept's course plus the courses of its attached files (a "Studying" item spans courses).
  function courseIndexText(index, course, sources = []) {
    const ids = new Set(sources.map((s) => s.file));
    const courses = new Set([course, ...index.files.filter((f) => ids.has(f.id)).map((f) => f.course)]);
    return index.files.filter((f) => courses.has(f.course))
      .map((f) => `${f.id} — ${f.title}: ` + f.sections.map((s) => (s.title ? `${s.n} ${s.title}` : `${s.n}`)).join("; "))
      .join("\n");
  }

  // The turn list for one sample() call. Rules, concept and material are never dropped;
  // the oldest chat turns go first, and material is cut only if it alone is too big.
  function buildInput({ concept, sourceTexts, indexText, explanation, turns, question, concise, maxBytes = 240000 }) {
    const head = RULES + (concise ? "\n" + CONCISE : "") + "\n\n# Concept\nTitle: " + concept.title + "\nCourse: " + concept.course +
      (concept.note ? "\nNote from the student: " + concept.note : "");
    const tail = indexText ? "\n\n# Other material in this course (file id — title: slide numbers and titles)\n" + indexText : "";
    const rest = explanation ? [{ role: "user", content: "Explain this concept." }, { role: "assistant", content: explanation }] : [];
    const kept = (turns || []).map((t) => ({ role: t.role, content: t.content }));
    const size = (first) => bytes(first) + [...rest, ...kept].reduce((n, t) => n + bytes(t.content), 0) + bytes(question);
    const material = (texts) => texts.length
      ? "\n\n# Attached course material\n" + texts.map((s) => "## File " + s.label + "\n" + s.text).join("\n\n") : "";

    let texts = sourceTexts || [];
    while (kept.length && size(head + material(texts) + tail) > maxBytes) kept.shift();
    const over = size(head + material(texts) + tail) - maxBytes;
    if (over > 0) {
      const note = "\n[material cut to fit]";
      const total = texts.reduce((n, s) => n + s.text.length, 0);
      const keep = Math.max(0, 1 - (over + texts.length * (note.length + 8)) / total);
      // ponytail: proportional cut by characters, safe for ASCII-heavy slides; cut by section if lectures grow
      texts = texts.map((s) => ({ label: s.label, text: s.text.slice(0, Math.floor(s.text.length * keep * 0.98)) + note }));
    }
    return [{ role: "user", content: head + material(texts) + tail }, ...rest, ...kept, { role: "user", content: question }];
  }

  // Math is lifted out before Markdown runs, so _ * \\ < inside formulas survive.
  // ponytail: a $...$ inside a fenced code block is also lifted; fine until code samples use dollar signs
  const MATH = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$(?!\s)(?:\\.|[^$\\\n])+?(?<!\s)\$/g;

  function protectMath(text) {
    const math = [];
    return { text: text.replace(MATH, (m) => "XMATHX" + (math.push(m) - 1) + "X"), math };
  }

  // escape=true when the result goes into HTML: quotes too, because a formula can sit inside an attribute.
  function restoreMath(html, math, escape) {
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    return html.replace(/XMATHX(\d+)X/g, (_, i) => (escape ? esc(math[i]) : math[i]));
  }

  // A concept's chat, kept in chunk documents concepts/{id}/chat/{chunk} = {turns: [...]}.
  // Each page load writes only chunks it created (ids start with its sessionId), so two
  // devices with the same concept open can never overwrite each other's turns.
  function mergeTurns(chunks) {
    return chunks.flatMap((c) => c.turns || []).map((t, i) => [t, i])
      .sort((a, b) => (a[0].at || 0) - (b[0].at || 0) || a[1] - b[1]).map((x) => x[0]);
  }
  function chatStore(db, conceptId, sessionId, maxBytes = 150000) {
    const coll = () => db.collection("concepts/" + conceptId + "/chat");
    const read = async () => (await coll().get()).docs.map((d) => ({ id: d.id, turns: (d.data() || {}).turns || [] }));
    let own = null, n = 0;
    return {
      async load() { return mergeTurns(await read()); },
      async append(turn) {
        if (!own || bytes(JSON.stringify([...own.turns, turn])) > maxBytes) own = { id: sessionId + "-" + String(n++).padStart(2, "0"), turns: [] };
        own.turns.push(turn);
        await coll().doc(own.id).set({ turns: own.turns });
      },
      async removeAll() { for (const c of await read()) await coll().doc(c.id).delete(); },
    };
  }

  // A sample tool result is JSON-encoded and capped near 32 KB; LaTeX doubles its backslashes there.
  function capToolResult(text, maxBytes = 30000) {
    const note = "\n[cut to fit; ask for a narrower range]";
    if (bytes(JSON.stringify(text)) <= maxBytes) return text;
    let cut = text;
    while (cut && bytes(JSON.stringify(cut + note)) > maxBytes) cut = cut.slice(0, Math.floor(cut.length * 0.9));
    return cut + note;
  }

  // ---------- plots: Claude writes a ```plot JSON spec, the page samples and draws it ----------
  function niceTicks(lo, hi, n = 5) {
    const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw)), r = raw / mag;
    const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag, out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
    return out;
  }

  // One optional slider parameter: {"name", "from", "to", "value"?, "label"?}. Null when absent or unusable.
  function plotParam(spec) {
    const p = spec && spec.param;
    if (!p || !p.name || p.name === "x") return null;
    const from = Number(p.from), to = Number(p.to), v = Number(p.value);
    if (!(to > from)) return null;
    return { name: String(p.name), label: String(p.label || p.name), from, to, value: Number.isFinite(v) ? Math.min(Math.max(v, from), to) : from };
  }

  // compile(expr) -> (scope) => value, scope = {x, <param name>}. Bad or non-finite values stay NaN, so the line breaks there.
  // pval: the parameter's value for this frame (ignored without a param).
  function samplePlot(spec, compile, n = 400, pval) {
    const x = (spec && spec.x || []).map(Number);
    if (x.length !== 2 || !(x[1] > x[0])) throw new Error('A plot needs "x": [lo, hi].');
    const par = plotParam(spec), base = par ? { [par.name]: pval == null ? par.value : pval } : {};
    const num = (v, scope) => {   // a number, or an expression in the parameter (e.g. a line at x = "b")
      if (typeof v !== "string") return Number(v);
      try { return Number(compile(v)(scope)); } catch { return NaN; }
    };
    const curves = (spec.curves || []).slice(0, 4).map((c) => {
      let pts;
      if (Array.isArray(c.points)) pts = c.points.map((p) => [Number(p[0]), Number(p[1])]);
      else {
        const f = compile(String(c.f));
        pts = Array.from({ length: n + 1 }, (_, i) => {
          const xi = x[0] + ((x[1] - x[0]) * i) / n;
          let y; try { y = Number(f({ ...base, x: xi })); } catch { y = NaN; }
          return [xi, Number.isFinite(y) ? y : NaN];
        });
      }
      return { label: String(c.label || c.f || ""), pts };
    });
    const marks = (spec.marks || []).map((m) => ({ x: num(m.x, base), y: num(m.y, { ...base, x: num(m.x, base) }), label: String(m.label || "") }))
      .filter((m) => Number.isFinite(m.x) && Number.isFinite(m.y));
    const vlines = (spec.vlines || []).map((v) => ({ x: num(v.x, base), label: String(v.label || "") })).filter((v) => Number.isFinite(v.x));
    let y = (spec.y || []).map(Number);
    if (!(y.length === 2 && y[1] > y[0])) {
      const ys = curves.flatMap((c) => c.pts.map((p) => p[1])).concat(marks.map((m) => m.y)).filter(Number.isFinite);
      if (!ys.length) throw new Error("Nothing to plot.");
      let lo = ys.reduce((a, b) => Math.min(a, b)), hi = ys.reduce((a, b) => Math.max(a, b));
      if (lo === hi) { lo -= 1; hi += 1; }
      y = [lo - (hi - lo) * 0.05, hi + (hi - lo) * 0.05];
    }
    return { x, y, curves, marks, vlines, xlabel: String(spec.xlabel || ""), ylabel: String(spec.ylabel || "") };
  }

  // A y range that holds still while the parameter moves: the union over five values of it.
  function plotYRange(spec, compile) {
    const y = (spec.y || []).map(Number);
    if (y.length === 2 && y[1] > y[0]) return y;
    const par = plotParam(spec), vals = par ? [0, 0.25, 0.5, 0.75, 1].map((k) => par.from + k * (par.to - par.from)) : [undefined];
    const ys = vals.map((v) => samplePlot(spec, compile, 100, v).y);
    return [Math.min(...ys.map((r) => r[0])), Math.max(...ys.map((r) => r[1]))];
  }

  // The address that opens a source's PDF in the reader page (Margin Questions, published as reader.html).
  function readerUrl(file, name, page) {
    const q = new URLSearchParams({ file: "materials/" + file + ".pdf", name });
    if (page) q.set("page", page);
    q.set("back", "index.html");
    return "reader.html#" + q;
  }

  const api = { RULES, CONCISE, readerUrl, withReads, niceTicks, plotParam, samplePlot, plotYRange, splitSections, sliceSections, resolveSources, courseIndexText, buildInput, protectMath, restoreMath, mergeTurns, chatStore, capToolResult };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CatchupLib = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
