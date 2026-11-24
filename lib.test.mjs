// Run: node --test Catchup/lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const L = createRequire(import.meta.url)("./lib.js");

const md = "---\ntitle: T\n---\n## Slide 1 — A\none\n## Slide 2\ntwo\n## Slide 15 — Balancing scores\n$X \\perp A \\mid b(X)$\n";

test("splitSections", () => {
  const s = L.splitSections(md);
  assert.deepEqual(s.map(x => x.n), [1, 2, 15]);
  assert.equal(s[2].title, "Balancing scores");
});

test("sliceSections range, reversed, out of bounds", () => {
  assert.match(L.sliceSections(md, 15, 15), /perp/);
  assert.doesNotMatch(L.sliceSections(md, 1, 2), /perp/);
  assert.equal(L.sliceSections(md, 20, 3), "");
  assert.equal(L.sliceSections(md, 999, 999), "");
  assert.match(L.sliceSections(md), /one[\s\S]*two[\s\S]*perp/);
});

test("resolveSources reports missing ids", () => {
  const index = { files: [{ id: "ci/lecture-4", course: "CI", title: "Lecture 4", sections: [] }] };
  const r = L.resolveSources([{ file: "ci/lecture-4", from: 15, to: 15 }, { file: "ci/gone" }], index);
  assert.equal(r.found.length, 1);
  assert.equal(r.found[0].title, "Lecture 4");
  assert.deepEqual(r.missing, ["ci/gone"]);
});

test("courseIndexText lists only that course's files with slide titles", () => {
  const index = { files: [
    { id: "ci/lecture-4", course: "CI", title: "Lecture 4", sections: [{ n: 14, title: "Recap" }, { n: 15, title: "Balancing scores" }] },
    { id: "macro/preliminaries", course: "Macro", title: "Preliminaries", sections: [{ n: 1, title: "Intro" }] },
  ] };
  const t = L.courseIndexText(index, "CI");
  assert.match(t, /ci\/lecture-4 — Lecture 4: 14 Recap; 15 Balancing scores/);
  assert.doesNotMatch(t, /macro/);
  assert.match(L.courseIndexText(index, "Studying", [{ file: "macro/preliminaries" }]), /macro\/preliminaries/);
});

test("buildInput starts and ends on user and keeps rules under the limit", () => {
  const turns = Array.from({ length: 400 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x".repeat(2000) + i }));
  const input = L.buildInput({ concept: { title: "Leibniz rule", course: "Macro", note: "" },
    sourceTexts: [{ label: "macro/preliminaries", text: "SRC" }], indexText: "IDX",
    explanation: "EXPL", turns, question: "why?", maxBytes: 240000 });
  assert.equal(input[0].role, "user");
  assert.equal(input.at(-1).role, "user");
  assert.equal(input.at(-1).content, "why?");
  assert.ok(input[0].content.includes(L.RULES) && input[0].content.includes("SRC") && input[0].content.includes("IDX"));
  assert.ok(new TextEncoder().encode(input.map(t => t.content).join("")).length <= 240000);
  assert.ok(!input.some(t => t.content.endsWith("x0")));   // oldest turn dropped
  assert.ok(input.some(t => t.content.endsWith("399")));   // newest kept
  assert.ok(input.some(t => t.role === "assistant" && t.content === "EXPL"));
});

test("buildInput without explanation or turns is one instruction turn plus the question", () => {
  const input = L.buildInput({ concept: { title: "Atoms", course: "Macro", note: "mass points" },
    sourceTexts: [], indexText: "", explanation: null, turns: [], question: "Explain this concept." });
  assert.deepEqual(input.map(t => t.role), ["user", "user"]);
  assert.ok(input[0].content.includes("Atoms") && input[0].content.includes("mass points"));
});

test("buildInput adds the concise rule only when asked", () => {
  const arg = { concept: { title: "T", course: "C", note: "" }, sourceTexts: [], indexText: "", explanation: null, turns: [], question: "q" };
  assert.ok(!L.buildInput(arg)[0].content.includes(L.CONCISE));
  assert.ok(L.buildInput({ ...arg, concise: true })[0].content.includes(L.CONCISE));
});

test("protectMath round-trips math untouched", () => {
  const src = "a_b $a_i^* \\\\ b_j < c$ and $$\\begin{aligned} x &= 1 \\\\ y &= 2 \\end{aligned}$$ and \\(z_1\\) costs $5";
  const p = L.protectMath(src);
  assert.equal(p.math.length, 3);
  assert.ok(!p.text.includes("a_i") && p.text.includes("a_b") && p.text.includes("$5"));
  assert.equal(L.restoreMath(p.text, p.math), src);
});

test("restoreMath escapes HTML characters inside math", () => {
  const p = L.protectMath("$a < b$ & more");
  assert.equal(L.restoreMath(p.text, p.math, true), "$a &lt; b$ & more");
});

test("buildInput cuts oversized attached material instead of exceeding the limit", () => {
  const input = L.buildInput({ concept: { title: "T", course: "CI", note: "" },
    sourceTexts: [{ label: "ci/a", text: "s".repeat(200000) }, { label: "ci/b", text: "t".repeat(200000) }],
    indexText: "IDX", explanation: null, turns: [], question: "q", maxBytes: 240000 });
  assert.ok(new TextEncoder().encode(input.map(t => t.content).join("")).length <= 240000);
  assert.ok(input[0].content.includes(L.RULES) && input[0].content.includes("[material cut to fit]"));
  assert.ok(input[0].content.includes("ci/a") && input[0].content.includes("ci/b"));
});

// ---- final-review fixes ----
function fakeDb() {
  const docs = new Map();
  const collection = (coll) => ({
    doc: (id) => ({
      set: async (d) => { docs.set(coll + "/" + id, JSON.parse(JSON.stringify(d))); },
      delete: async () => { docs.delete(coll + "/" + id); },
    }),
    get: async () => ({ docs: [...docs.keys()].filter((k) => k.startsWith(coll + "/")).sort()
      .map((k) => ({ id: k.slice(coll.length + 1), data: () => docs.get(k) })) }),
  });
  return { collection, docs };
}

test("two devices appending to one chat never overwrite each other", async () => {
  const db = fakeDb();
  const laptop = L.chatStore(db, "c1", "laptop"), phone = L.chatStore(db, "c1", "phone");
  await laptop.append({ role: "user", content: "q1", at: 1 });
  await laptop.append({ role: "assistant", content: "a1", at: 2 });
  await laptop.load();                                    // laptop's view is now stale
  await phone.append({ role: "user", content: "q2", at: 3 });
  await phone.append({ role: "assistant", content: "a2", at: 4 });
  await laptop.append({ role: "user", content: "q3", at: 5 });
  assert.deepEqual((await phone.load()).map((t) => t.content), ["q1", "a1", "q2", "a2", "q3"]);
});

test("chatStore starts a new chunk before one passes the byte limit, and removeAll clears them", async () => {
  const db = fakeDb(), s = L.chatStore(db, "c1", "s", 1000);
  for (let i = 0; i < 6; i++) await s.append({ role: "user", content: "ש".repeat(150) + i, at: i });   // Hebrew: 2 bytes per char
  assert.ok(db.docs.size > 1);
  for (const d of db.docs.values()) assert.ok(new TextEncoder().encode(JSON.stringify(d.turns)).length <= 1000);
  assert.equal((await s.load()).length, 6);
  await s.removeAll();
  assert.equal(db.docs.size, 0);
});

test("restoreMath with escape cannot break out of an HTML attribute", () => {
  const p = L.protectMath('![$x" onerror="alert(1)//$](nope)');
  const html = L.restoreMath('<img alt="' + p.text.slice(2, p.text.indexOf("]")) + '">', p.math, true);
  assert.ok(!/"\s*onerror=/.test(html.replace(/^<img alt="/, "")));
  assert.ok(html.includes("&quot;"));
});

test("capToolResult keeps the JSON-encoded result under the tool limit", () => {
  const long = "\\alpha_{i}\n".repeat(6000);
  const out = L.capToolResult(long, 30000);
  assert.ok(new TextEncoder().encode(JSON.stringify(out)).length <= 30000);
  assert.ok(out.endsWith("ask for a narrower range]"));
  assert.equal(L.capToolResult("short", 30000), "short");
});

test("withReads adds earlier tool reads after sources, without exact duplicates", () => {
  const out = L.withReads([{ file: "a", from: 1, to: 2 }], [{ file: "a", from: 1, to: 2 }, { file: "b", from: 10 }, { file: "b", from: 10 }, null]);
  assert.deepEqual(out, [{ file: "a", from: 1, to: 2 }, { file: "b", from: 10, to: undefined, read: true }]);
  assert.deepEqual(L.withReads(undefined, undefined), []);
});

test("niceTicks", () => {
  assert.deepEqual(L.niceTicks(0, 1), [0, 0.2, 0.4, 0.6, 0.8, 1]);
  assert.deepEqual(L.niceTicks(-3, 7), [-2, 0, 2, 4, 6]);
});

test("samplePlot: functions, points, auto y range, broken values", () => {
  const compile = (e) => (e === "bad" ? () => { throw new Error("x"); } : (s) => (e === "sq" ? s.x * s.x : 1 / (s.x - 0.5)));
  const p = L.samplePlot({ x: [0, 1], curves: [{ f: "sq", label: "$x^2$" }, { f: "bad" }, { points: [[0, 2], [1, 3]] }] }, compile, 4);
  assert.equal(p.curves[0].pts.length, 5);
  assert.deepEqual(p.curves[0].pts[2], [0.5, 0.25]);
  assert.ok(p.curves[1].pts.every(([, y]) => Number.isNaN(y)));
  assert.ok(p.y[0] < 0 && p.y[1] > 3);
  assert.throws(() => L.samplePlot({ x: [1, 0] }, compile), /x/);
  const pole = L.samplePlot({ x: [0, 1], y: [-5, 5], curves: [{ f: "pole" }] }, compile, 2);
  assert.ok(Number.isNaN(pole.curves[0].pts[1][1]) || !Number.isFinite(pole.curves[0].pts[1][1]));
});

test("RULES plot example is valid JSON", () => {
  const block = L.RULES.split("```plot\n")[1].split("\n```")[0];
  const spec = JSON.parse(block);
  assert.equal(spec.curves.length, 2);
  assert.equal(L.plotParam(spec).name, "b");
});

test("param: slider value reaches functions and lines; y range holds still", () => {
  const compile = (e) => (s) => (e === "x - b" ? s.x - s.b : e === "b" ? s.b : NaN);
  const spec = { x: [0, 1], param: { name: "b", from: 0, to: 1, value: 0.2 }, curves: [{ f: "x - b" }], vlines: [{ x: "b" }] };
  const p = L.samplePlot(spec, compile, 2, 0.5);
  assert.deepEqual(p.curves[0].pts.map(([, y]) => y), [-0.5, 0, 0.5]);
  assert.equal(p.vlines[0].x, 0.5);
  assert.equal(L.samplePlot(spec, compile, 2).vlines[0].x, 0.2);   // default value
  const y = L.plotYRange(spec, compile);
  assert.ok(y[0] <= -1 && y[1] >= 1);
  assert.equal(L.plotParam({ param: { name: "x", from: 0, to: 1 } }), null);
  assert.equal(L.plotParam({ param: { name: "b", from: 1, to: 0 } }), null);
});

test("readerUrl names the PDF, its title, the page and the way back", () => {
  const q = (u) => new URLSearchParams(u.split("#")[1]);
  const u = L.readerUrl("macro/x", "Lecture 1 · slides 3–5", 19);
  assert.ok(u.startsWith("reader.html#"));
  assert.deepEqual(Object.fromEntries(q(u)), { file: "materials/macro/x.pdf", name: "Lecture 1 · slides 3–5", page: "19", back: "index.html" });
  assert.equal(q(L.readerUrl("macro/x", "A & B")).has("page"), false);
  assert.equal(q(L.readerUrl("macro/x", "A & B")).get("name"), "A & B");
});
