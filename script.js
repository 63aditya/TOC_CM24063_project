/* LLG -> RLG Inter-converter | Aditya Dhondiba Kangire | CM24063 | Theory of Computation */
"use strict";
const EPS_WORDS = ["ε", "epsilon", "eps", "lambda", "λ"];

/* ---------- 1. Parser + validator (Left-Linear Grammar, normal form A -> Ba | a | ε) ---------- */
function normalizeArrows(s) { return s.replace(/→|⟶|⇒|=>|-->|::=|:=/g, "->"); }

function checkAlt(alt, nt, line) {
  const where = `Line ${line} (${nt} → …): `;
  if (alt === "") return where + "empty alternative. Use ε explicitly for the empty string.";
  if (EPS_WORDS.includes(alt.toLowerCase()) || alt === "ε") return null;
  const bad = alt.match(/[^a-z0-9A-Z]/);
  if (bad) return where + `invalid symbol '${bad[0]}' in "${alt}". Only a–z, 0–9 (terminals) and A–Z (non-terminals) are allowed.`;
  const nts = (alt.match(/[A-Z]/g) || []).length;
  if (nts > 1) return where + `"${alt}" has more than one non-terminal. Left-linear allows at most one, at the left end (A → Ba).`;
  if (nts === 0) {
    if (alt.length === 1) return null;
    return where + `"${alt}" has several terminals. This tool supports the normal form A → Ba | a | ε (one terminal per production). Split it using extra non-terminals.`;
  }
  const at = alt.search(/[A-Z]/);
  if (at === 0) {
    if (alt.length === 1) return where + `"${alt}" is a unit production (only a non-terminal). Eliminate unit productions first; the normal form is A → Ba | a | ε.`;
    if (alt.length === 2) return null;
    return where + `"${alt}" has several terminals after the non-terminal. This tool supports one terminal per production (A → Ba).`;
  }
  if (at === alt.length - 1) return where + `"${alt}" is right-linear (non-terminal at the RIGHT end). This tool converts LEFT-linear grammars: the non-terminal may appear only at the left end (A → Ba).`;
  return where + `"${alt}": the non-terminal is in the middle. In a left-linear grammar it may only be the FIRST symbol.`;
}

function parseGrammar(text) {
  const res = { ok: false, errors: [], warnings: [], productions: {}, order: [], start: null, terminals: [] };
  if (!text || !text.trim()) { res.errors.push("Grammar is empty. Enter at least one production, e.g.  S -> Aa | b"); return res; }
  const lines = normalizeArrows(text).split(/\r?\n/);
  lines.forEach((raw, i) => {
    const ln = i + 1, line = raw.trim();
    if (!line) return;
    const parts = line.split("->");
    if (parts.length !== 2) { res.errors.push(`Line ${ln}: "${line}" must have exactly one arrow (->  or →), e.g.  A -> Ba | b`); return; }
    const lhs = parts[0].trim();
    if (!/^[A-Z]$/.test(lhs)) { res.errors.push(`Line ${ln}: left side "${lhs}" must be a single non-terminal (one capital letter A–Z).`); return; }
    if (!res.productions[lhs]) { res.productions[lhs] = []; res.order.push(lhs); }
    const alts = parts[1].split("|").map(a => a.replace(/\s+/g, ""));
    alts.forEach(a => {
      const err = checkAlt(a, lhs, ln);
      if (err) { res.errors.push(err); return; }
      const norm = EPS_WORDS.includes(a.toLowerCase()) ? "ε" : a;
      if (res.productions[lhs].includes(norm)) res.warnings.push(`Line ${ln}: duplicate alternative "${lhs} → ${norm}" ignored.`);
      else res.productions[lhs].push(norm);
    });
  });
  if (res.errors.length) return res;
  if (!res.order.length) { res.errors.push("No productions found."); return res; }
  if (res.order.length >= 26) { res.errors.push("The grammar already uses all 26 capital letters; one free letter is needed for the new start symbol of the RLG."); return res; }
  const used = new Set(), terms = new Set();
  res.order.forEach(A => res.productions[A].forEach(p => {
    if (p === "ε") return;
    if (p.length === 2) { used.add(p[0]); terms.add(p[1]); } else terms.add(p);
  }));
  used.forEach(B => { if (!res.productions[B]) res.errors.push(`Non-terminal "${B}" is used on a right side but has no production of its own (missing definition).`); });
  if (res.errors.length) return res;
  res.start = res.order[0];
  res.terminals = [...terms].sort();
  // reachability warning (in a left-linear rule A -> Ba, A "uses" B)
  const seen = new Set([res.start]), stack = [res.start];
  while (stack.length) { const A = stack.pop(); res.productions[A].forEach(p => { if (p.length === 2 && p !== "ε" && !seen.has(p[0])) { seen.add(p[0]); stack.push(p[0]); } }); }
  res.order.forEach(A => { if (!seen.has(A)) res.warnings.push(`Non-terminal "${A}" is unreachable from start symbol ${res.start} (it is dropped from the RLG).`); });
  res.ok = true; return res;
}

/* ---------- 2. LLG -> RLG (direct construction through the reversed NFA) ----------
   LLG  A -> Ba  : move  B --a--> A          (reverse the rule)
   LLG  A -> a   : move  Z --a--> A          (new start state Z)
   LLG  A -> ε   : ε-move Z => A, removed by copying every move of A to Z
   final state   : S (start symbol of the LLG)  (+ Z when ε is in L)
   RLG  p --a--> q : p -> aq      final f : f -> ε      start symbol : Z               */
function freshStart(used) { for (const c of "ZYXWVUTRQPONMLKJIHGFEDCBAS") if (!used.includes(c)) return c; return null; }

function convert(g) {
  const q0 = freshStart(g.order), S = g.start;
  const edges = [], idx = {};
  const addEdge = (from, sym, to, src) => {
    const k = from + "|" + sym + "|" + to;
    if (idx[k]) { idx[k].srcs.push(src); return; }
    const e = { from, sym, to, srcs: [src] }; idx[k] = e; edges.push(e);
  };
  const prods = [];
  g.order.forEach(A => g.productions[A].forEach(p => prods.push({ lhs: A, rhs: p, i: prods.length })));
  // step 1: reverse every production
  prods.forEach(pr => {
    if (pr.rhs === "ε") return;
    if (pr.rhs.length === 2) addEdge(pr.rhs[0], pr.rhs[1], pr.lhs, pr.i);
    else addEdge(q0, pr.rhs, pr.lhs, pr.i);
  });
  // step 2: remove the ε-moves (Z => A for every A -> ε)
  const base = edges.slice();
  let epsInLang = false;
  prods.forEach(pr => {
    if (pr.rhs !== "ε") return;
    base.filter(e => e.from === pr.lhs).forEach(e => addEdge(q0, e.sym, e.to, pr.i));
    if (pr.lhs === S) epsInLang = true;
  });
  // step 3: final states
  const finalsAll = [S]; if (epsInLang) finalsAll.push(q0);
  // step 4: remove useless states (not reachable from Z, or unable to reach a final state)
  const allStates = [q0, ...g.order];
  const fwd = new Set([q0]); let ch = true;
  while (ch) { ch = false; edges.forEach(e => { if (fwd.has(e.from) && !fwd.has(e.to)) { fwd.add(e.to); ch = true; } }); }
  const bwd = new Set(finalsAll); ch = true;
  while (ch) { ch = false; edges.forEach(e => { if (bwd.has(e.to) && !bwd.has(e.from)) { bwd.add(e.from); ch = true; } }); }
  const useful = new Set(allStates.filter(s => fwd.has(s) && bwd.has(s)));
  const empty = !useful.has(q0);
  const keptEdges = empty ? [] : edges.filter(e => useful.has(e.from) && useful.has(e.to));
  keptEdges.forEach(e => { e.kept = true; });
  const states = empty ? [] : allStates.filter(s => useful.has(s));
  const finals = empty ? [] : finalsAll.filter(s => useful.has(s));
  const removed = [];
  if (!empty) allStates.forEach(s => {
    if (useful.has(s) || s === q0) return;
    if (!fwd.has(s)) removed.push({ state: s, why: g.productions[s].includes("ε") ? `its only role is the ε-production, so its moves were copied to ${q0}` : "it cannot derive any terminal string (non-productive)" });
    else removed.push({ state: s, why: `it is unreachable from the start symbol ${S}` });
  });
  // step 5: write the RLG  p --a--> q  =>  p -> aq ;  final f => f -> ε
  const rlg = { start: q0, order: [], productions: {} };
  states.forEach(s => {
    const alts = [];
    keptEdges.filter(e => e.from === s).forEach(e => { const a = e.sym + e.to; if (!alts.includes(a)) alts.push(a); });
    if (finals.includes(s)) alts.push("ε");
    rlg.order.push(s); rlg.productions[s] = alts;
  });
  const rlgText = rlg.order.map(A => `${A} → ${rlg.productions[A].join(" | ")}`).join("\n");
  const delta = {};
  keptEdges.forEach(e => { const k = e.from + "|" + e.sym; (delta[k] = delta[k] || new Set()).add(e.to); });
  const nfa = { states, alphabet: g.terminals, start: q0, finals, transitions: keptEdges, delta };
  return { q0, S, prods, edges, keptEdges, states, finals, empty, removed, epsInLang, rlg, rlgText, nfa, alphabet: g.terminals,
           nProductions: rlg.order.reduce((n, A) => n + rlg.productions[A].length, 0) };
}

/* ---------- 3. Language-integrity check (independent enumeration of both grammars) ---------- */
// Words of length <= N generated by a grammar of kind "L" (A -> Ba) or "R" (A -> aB), by dynamic programming on length.
function wordsOf(gr, kind, N) {
  const out = new Set();
  if (!gr.order.length) return out;
  const L = {}; gr.order.forEach(A => { L[A] = [new Set(gr.productions[A].includes("ε") ? [""] : [])]; });
  for (let n = 1; n <= N; n++) gr.order.forEach(A => {
    const set = new Set();
    gr.productions[A].forEach(p => {
      if (p === "ε") return;
      if (p.length === 1) { if (n === 1) set.add(p); return; }
      if (kind === "L") (L[p[0]] ? L[p[0]][n - 1] : []).forEach(w => set.add(w + p[1]));
      else (L[p[1]] ? L[p[1]][n - 1] : []).forEach(w => set.add(p[0] + w));
    });
    L[A].push(set);
  });
  L[gr.start].forEach(s => s.forEach(w => out.add(w)));
  return out;
}
function verifyLanguage(g, conv) {
  const k = Math.max(1, g.terminals.length);
  let N = 1; while (N < 8 && Math.pow(k, N + 1) <= 20000) N++;
  const a = wordsOf(g, "L", N), b = wordsOf(conv.rlg, "R", N);
  const diff = [...a].filter(w => !b.has(w)).concat([...b].filter(w => !a.has(w)));
  return { N, countLLG: a.size, countRLG: b.size, same: diff.length === 0, diff: diff.slice(0, 5) };
}

/* ---------- 4. Membership + derivations (for the "Check a String" section) ---------- */
function deriveLLG(g, A, w, memo = {}) {
  const key = A + "|" + w; if (key in memo) return memo[key];
  memo[key] = null; let ans = null;
  for (const p of g.productions[A] || []) {
    if (ans) break;
    if (p === "ε") { if (w === "") ans = [{ lhs: A, rhs: "ε" }]; }
    else if (p.length === 1) { if (w === p) ans = [{ lhs: A, rhs: p }]; }
    else if (w.length && w[w.length - 1] === p[1]) { const sub = deriveLLG(g, p[0], w.slice(0, -1), memo); if (sub) ans = [{ lhs: A, rhs: p }, ...sub]; }
  }
  return (memo[key] = ans);
}
function deriveRLG(r, A, w, memo = {}) {
  const key = A + "|" + w; if (key in memo) return memo[key];
  memo[key] = null; let ans = null;
  for (const p of r.productions[A] || []) {
    if (ans) break;
    if (p === "ε") { if (w === "") ans = [{ lhs: A, rhs: "ε" }]; }
    else if (p.length === 1) { if (w === p) ans = [{ lhs: A, rhs: p }]; }
    else if (w.length && w[0] === p[0]) { const sub = deriveRLG(r, p[1], w.slice(1), memo); if (sub) ans = [{ lhs: A, rhs: p }, ...sub]; }
  }
  return (memo[key] = ans);
}
function forms(start, steps) {
  let cur = start; const out = [{ rule: "start symbol", form: cur }];
  steps.forEach(st => { cur = cur.replace(/[A-Z]/, st.rhs === "ε" ? "" : st.rhs); out.push({ rule: `${st.lhs} → ${st.rhs}`, form: cur === "" ? "ε" : cur }); });
  return out;
}
function checkString(g, conv, str) {
  const s = (str || "").replace(/\s+/g, "");
  for (const c of s) if (!g.terminals.includes(c))
    return { error: `Invalid test string: symbol '${c}' is not in the alphabet Σ = { ${g.terminals.join(", ")} }.` };
  const dl = deriveLLG(g, g.start, s), dr = conv.empty ? null : deriveRLG(conv.rlg, conv.rlg.start, s);
  const accL = !!dl, accR = !!dr;
  return { str: s, accL, accR, agree: accL === accR, accepted: accR,
           formsL: dl ? forms(g.start, dl) : null, formsR: dr ? forms(conv.rlg.start, dr) : null };
}

/* ---------- 5. Verification test cases (each is really evaluated) ---------- */
const G1 = "S -> Aa | b\nA -> Sb | a";
const TESTS = [
  { id: "Test 1", label: "S→Aa|b / A→Sb|a", g: G1, str: "bba", expect: "ACCEPTED", what: "valid LLG, string in L = (b | aa)(ba)*" },
  { id: "Test 2", label: "S→S0|S1|1", g: "S -> S0 | S1 | 1", str: "0110", expect: "REJECTED", what: "binary alphabet, string does not start with 1" },
  { id: "Test 3", label: "S→Aa|b / A→Ab|ε", g: "S -> Aa | b\nA -> Ab | ε", str: "bba", expect: "ACCEPTED", what: "ε-production on A (ε-removal copies its moves)" },
  { id: "Test 4", label: "S→Sa|Sb|ε", g: "S -> Sa | Sb | ε", str: "abba", expect: "ACCEPTED", what: "ε-production on the start symbol (ε ∈ L)" },
  { id: "Test 5", label: "S→Ab|c / A→Aa|a", g: "S -> Ab | c\nA -> Aa | a", str: "aabb", expect: "REJECTED", what: "terminal-only productions; L = a⁺b | c rejects aabb" },
  { id: "Invalid 1", label: "S→aA|b (right-linear)", g: "S -> aA | b\nA -> aS | b", str: "", expect: "INVALID GRAMMAR", what: "non-terminal on the right: not left-linear", bad: 1 },
  { id: "Invalid 2", label: "S→Ba|b (B undefined)", g: "S -> Ba | b", str: "", expect: "INVALID GRAMMAR", what: "missing non-terminal definition", bad: 1 },
  { id: "Invalid 3", label: "S→ab (two terminals)", g: "S -> ab", str: "", expect: "INVALID GRAMMAR", what: "unsupported production form", bad: 1 },
  { id: "Invalid 4", label: "S→aAb (A in middle)", g: "S -> aAb\nA -> a", str: "", expect: "INVALID GRAMMAR", what: "non-terminal not at the left end", bad: 1 },
  { id: "Invalid 5", label: "S→a$ (bad symbol)", g: "S -> a$ | b", str: "", expect: "INVALID GRAMMAR", what: "symbol outside a–z, 0–9, A–Z", bad: 1 },
  { id: "Invalid 6", label: "Empty input", g: "", str: "", expect: "INVALID GRAMMAR", what: "empty grammar", bad: 1 },
  { id: "Invalid 7", label: "Test 1 grammar + string abc", g: G1, str: "abc", expect: "INVALID STRING", what: "symbol 'c' not in Σ = {a, b}", bad: 1 }
];
function evaluate(gText, str) {
  const g = parseGrammar(gText);
  if (!g.ok) return "INVALID GRAMMAR";
  const conv = convert(g), r = checkString(g, conv, str);
  if (r.error) return "INVALID STRING";
  if (!r.agree) return "MISMATCH";
  return r.accepted ? "ACCEPTED" : "REJECTED";
}

/* ---------- 6. SVG diagram of the automaton behind the RLG ---------- */
function drawNFA(nfa) {
  const W = 700, H = 380, R = 24, n = nfa.states.length, ns = "http://www.w3.org/2000/svg";
  const pos = {}, rx = n === 1 ? 0 : W / 2 - 90, ry = n <= 2 ? 0 : H / 2 - 80;
  nfa.states.forEach((q, i) => { const a = Math.PI + 2 * Math.PI * i / n; pos[q] = { x: W / 2 + rx * Math.cos(a), y: H / 2 + ry * Math.sin(a) }; });
  if (n === 2) { pos[nfa.states[0]] = { x: W / 2 - 150, y: H / 2 }; pos[nfa.states[1]] = { x: W / 2 + 150, y: H / 2 }; }
  const groups = {};
  nfa.transitions.forEach(t => { const k = t.from + ">" + t.to; (groups[k] = groups[k] || { from: t.from, to: t.to, syms: [] }).syms.push(t.sym); });
  let s = `<svg xmlns="${ns}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Automaton behind the RLG"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker></defs>`;
  const cx = W / 2, cy = H / 2;
  Object.values(groups).forEach(e => {
    const label = [...new Set(e.syms)].sort().join(",");
    const a = pos[e.from], b = pos[e.to];
    if (e.from === e.to) {
      let ux = a.x - cx, uy = a.y - cy; const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l; if (l === 1 && ux === 0 && uy === 0) uy = -1;
      if (Math.hypot(a.x - cx, a.y - cy) < 1) { ux = 0; uy = -1; }
      const deg = Math.atan2(ux, -uy) * 180 / Math.PI;
      s += `<path class="edge" marker-end="url(#ah)" transform="rotate(${deg} ${a.x} ${a.y})" d="M${a.x - 10},${a.y - R + 3} C${a.x - 34},${a.y - R - 46} ${a.x + 34},${a.y - R - 46} ${a.x + 10},${a.y - R + 3}"/>`;
      s += `<text class="elabel" x="${a.x + ux * (R + 50)}" y="${a.y + uy * (R + 50) + 4}" text-anchor="middle">${label}</text>`;
      return;
    }
    const rev = groups[e.to + ">" + e.from] ? 1 : 0;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const off = rev ? 38 : 0, c = { x: mx + (-dy / d) * off, y: my + (dx / d) * off };
    const u1 = Math.hypot(c.x - a.x, c.y - a.y) || 1, u2 = Math.hypot(c.x - b.x, c.y - b.y) || 1;
    const p1 = { x: a.x + (c.x - a.x) / u1 * R, y: a.y + (c.y - a.y) / u1 * R }, p2 = { x: b.x + (c.x - b.x) / u2 * (R + 2), y: b.y + (c.y - b.y) / u2 * (R + 2) };
    s += `<path class="edge" marker-end="url(#ah)" d="M${p1.x},${p1.y} Q${c.x},${c.y} ${p2.x},${p2.y}"/>`;
    const lx = 0.25 * p1.x + 0.5 * c.x + 0.25 * p2.x, ly = 0.25 * p1.y + 0.5 * c.y + 0.25 * p2.y;
    const nx = -dy / d, ny = dx / d;
    s += `<text class="elabel" x="${lx + nx * (rev ? 12 : -10)}" y="${ly + ny * (rev ? 12 : -10) + 4}" text-anchor="middle">${label}</text>`;
  });
  nfa.states.forEach(q => {
    const p = pos[q], fin = nfa.finals.includes(q);
    s += `<circle class="state${q === nfa.start ? " start" : ""}" cx="${p.x}" cy="${p.y}" r="${R}"/>`;
    if (fin) s += `<circle class="final" cx="${p.x}" cy="${p.y}" r="${R - 5}"/>`;
    s += `<text class="slabel" x="${p.x}" y="${p.y + 5}" text-anchor="middle">${q}</text>`;
  });
  const sp = pos[nfa.start]; let ux = sp.x - cx, uy = sp.y - cy; const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;
  const ang = Math.atan2(uy, ux) + 1.0, ex = Math.cos(ang), ey = Math.sin(ang);
  s += `<line class="edge" marker-end="url(#ah)" x1="${sp.x + ex * (R + 42)}" y1="${sp.y + ey * (R + 42)}" x2="${sp.x + ex * (R + 2)}" y2="${sp.y + ey * (R + 2)}"/><text class="elabel" x="${sp.x + ex * (R + 56)}" y="${sp.y + ey * (R + 56) + 4}" text-anchor="middle">start</text>`;
  return s + "</svg>";
}

/* ---------- 7. UI ---------- */
function $(id) { return document.getElementById(id); }
function esc(t) { return String(t).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
const chip = t => `<span class="pill">${esc(t)}</span>`;
let CURRENT = null, CURG = null, LAST = "";

function setChips(g) {
  $("ntChips").innerHTML = g && g.ok ? g.order.map(chip).join("") : "—";
  $("tmChips").innerHTML = g && g.ok ? (g.terminals.map(chip).join("") || "none") : "—";
  $("stChips").innerHTML = g && g.ok ? chip(g.start) : "—";
}
function hideResults() { CURRENT = null; CURG = null; $("sec2").hidden = true; $("sec3").hidden = true; $("result").innerHTML = ""; }

function generate() {
  const text = $("grammar").value; LAST = text;
  const g = parseGrammar(text); setChips(g);
  const box = $("validation");
  if (!g.ok) {
    hideResults(); box.className = "status bad"; box.hidden = false;
    box.innerHTML = `<div class="stitle">✗ INVALID GRAMMAR</div><ul>${g.errors.map(e => `<li>${esc(e)}</li>`).join("")}</ul>`;
    return false;
  }
  const conv = convert(g); CURRENT = conv; CURG = g;
  box.className = "status good"; box.hidden = false;
  box.innerHTML = `<div class="stitle">✓ VALID LEFT-LINEAR GRAMMAR</div><p>Every production has the form A → Ba, A → a or A → ε, and every non-terminal used is defined.</p>` + (g.warnings.length ? `<ul>${g.warnings.map(w => `<li>Note: ${esc(w)}</li>`).join("")}</ul>` : "");
  $("sec2").hidden = false; $("sec3").hidden = false;
  const nts = conv.rlg.order;
  $("cards").innerHTML = [["LLG start symbol", g.start], ["RLG start symbol", conv.empty ? "—" : conv.q0], ["RLG non-terminals", conv.empty ? "{ }" : "{ " + nts.join(", ") + " }"], ["RLG productions", String(conv.nProductions)]]
    .map(c => `<div class="mini"><span>${c[0]}</span><b>${esc(c[1])}</b></div>`).join("");
  // output RLG
  if (conv.empty) {
    $("rlgOut").textContent = "(no productions)  —  L(G) = ∅";
    $("rlgNote").innerHTML = "<b>The language of this grammar is empty</b>: no terminal string can be derived from the start symbol, so the equivalent RLG has no productions.";
  } else {
    $("rlgOut").textContent = conv.rlgText;
    $("rlgNote").innerHTML = `Start symbol <b>${conv.q0}</b> is a new non-terminal (the "start-up" state of the reversed automaton). Final productions <code>X → ε</code> appear for: <b>${conv.finals.join(", ")}</b>.`;
  }
  // integrity check
  const v = verifyLanguage(g, conv);
  $("integrity").className = "status " + (v.same ? "good" : "bad");
  $("integrity").innerHTML = v.same
    ? `<div class="stitle">✓ LANGUAGE PRESERVED</div><p>All words of length ≤ ${v.N} were generated independently from the LLG and from the RLG: <b>${v.countLLG}</b> words in each set, and the two sets are <b>identical</b>.</p>`
    : `<div class="stitle">✗ LANGUAGE MISMATCH</div><p>LLG words: ${v.countLLG}, RLG words: ${v.countRLG}. Examples that differ: ${v.diff.map(w => `<code>${esc(w || "ε")}</code>`).join(", ")}</p>`;
  // notes
  const conv2 = [];
  conv2.push(`New start symbol <b>${conv.q0}</b> added; the LLG start symbol <b>${g.start}</b> becomes the final (ε) state.`);
  const epsN = conv.prods.filter(p => p.rhs === "ε").map(p => p.lhs);
  if (epsN.length) conv2.push(`ε-production(s) of <b>${epsN.join(", ")}</b> removed by copying their moves to ${conv.q0}${conv.epsInLang ? ` (and ${conv.q0} → ε added because ε ∈ L)` : ""}.`);
  conv.removed.forEach(r => conv2.push(`Non-terminal <b>${r.state}</b> dropped from the RLG: ${esc(r.why)}.`));
  $("convNote").innerHTML = conv2.map(c => `<li>${c}</li>`).join("");
  // conversion table
  let rows = conv.prods.map(pr => {
    const mv = conv.edges.filter(e => e.srcs.includes(pr.i));
    let rule, move, rl;
    if (pr.rhs === "ε") {
      rule = `ε-removal: ${conv.q0} takes the moves of ${pr.lhs}`;
      move = mv.length ? mv.map(e => `${e.from} --${e.sym}--> ${e.to}`).join(", ") : `none (${pr.lhs} has no outgoing move)`;
    } else if (pr.rhs.length === 2) {
      rule = `Reverse: ${pr.rhs[0]} becomes the source`; move = `${pr.rhs[0]} --${pr.rhs[1]}--> ${pr.lhs}`;
    } else { rule = `Start-up move from ${conv.q0}`; move = `${conv.q0} --${pr.rhs}--> ${pr.lhs}`; }
    const parts = mv.map(e => e.kept ? `${e.from} → ${e.sym}${e.to}` : `<s>${e.from} → ${e.sym}${e.to}</s> (pruned)`);
    if (pr.rhs === "ε" && pr.lhs === g.start && !conv.empty && conv.epsInLang) parts.push(`${conv.q0} → ε`);
    rl = parts.length ? parts.join(", ") : "—";
    return `<tr${pr.rhs === "ε" ? ' class="eps"' : ""}><td class="mono">${esc(pr.lhs)} → ${esc(pr.rhs)}</td><td>${esc(rule)}</td><td class="mono">${esc(move)}</td><td class="mono">${rl}</td></tr>`;
  }).join("");
  rows += `<tr class="eps"><td class="mono">start symbol ${esc(g.start)}</td><td>Final state of the reversed automaton</td><td class="mono">final = { ${esc(conv.finals.join(", ") || "∅")} }</td><td class="mono">${conv.finals.length ? conv.finals.map(f => f + " → ε").join(", ") : "—"}</td></tr>`;
  $("ttable").innerHTML = `<thead><tr><th>LLG production</th><th>Rule applied</th><th>Reversed-NFA move</th><th>RLG production</th></tr></thead><tbody>${rows}</tbody>`;
  // delta matrix
  const nfa = conv.nfa;
  if (conv.empty) { $("matrix").innerHTML = "<tbody><tr><td>L(G) = ∅, no automaton</td></tr></tbody>"; $("diagram").innerHTML = "<p class=\"hint\" style=\"padding:14px\">L(G) = ∅, so there is no automaton to draw.</p>"; }
  else {
    let m = `<thead><tr><th>δ</th>${nfa.alphabet.map(a => `<th>${esc(a)}</th>`).join("")}</tr></thead><tbody>`;
    nfa.states.forEach(q => { m += `<tr><td><b>${q === nfa.start ? "→" : ""}${nfa.finals.includes(q) ? "*" : ""}${q}</b></td>` + nfa.alphabet.map(a => { const v2 = nfa.delta[q + "|" + a]; return `<td class="mono">${v2 ? "{ " + [...v2].join(", ") + " }" : "∅"}</td>`; }).join("") + "</tr>"; });
    $("matrix").innerHTML = m + "</tbody>";
    $("diagram").innerHTML = drawNFA(nfa);
  }
  $("result").innerHTML = "";
  return true;
}

function derivTable(title, f) {
  const body = f.map((s, i) => `<tr><td>${i}</td><td class="mono">${esc(s.rule)}</td><td class="mono">${esc(s.form)}</td></tr>`).join("");
  return `<h3>${title}</h3><div class="tablewrap"><table><thead><tr><th>Step</th><th>Rule applied</th><th>Sentential form</th></tr></thead><tbody>${body}</tbody></table></div>`;
}
function check() {
  if (!CURRENT) { $("result").innerHTML = `<div class="status bad"><div class="stitle">✗ Enter a valid grammar first</div></div>`; return; }
  const r = checkString(CURG, CURRENT, $("teststr").value);
  if (r.error) { $("result").innerHTML = `<div class="status bad"><div class="stitle">✗ INVALID STRING</div><p>${esc(r.error)}</p></div>`; return; }
  const agree = r.agree
    ? `<p class="why">The LLG and the generated RLG give the <b>same answer</b> for this string, so the language is preserved here.</p>`
    : `<p class="why" style="color:#b91c1c"><b>Mismatch:</b> LLG says ${r.accL ? "accept" : "reject"} but RLG says ${r.accR ? "accept" : "reject"}.</p>`;
  let html = `<div class="verdict ${r.accepted ? "acc" : "rej"}"><span>${r.accepted ? "✓" : "✗"}</span> ${r.accepted ? "ACCEPTED" : "REJECTED"}</div>
   <p class="why"><b>Input:</b> <code>${r.str === "" ? "ε (empty string)" : esc(r.str)}</code> — ${r.accepted ? "derivable from both grammars." : "no derivation exists in either grammar."}</p>${agree}`;
  if (r.formsL) html += derivTable("Derivation in the given LLG", r.formsL);
  if (r.formsR) html += derivTable("Derivation in the generated RLG", r.formsR);
  $("result").innerHTML = html;
}

function runTest(i) {
  const t = TESTS[i]; $("grammar").value = t.g; $("teststr").value = t.str;
  const ok = generate(); if (ok) check();
  const actual = evaluate(t.g, t.str), pass = actual === t.expect;
  $("testBanner").hidden = false; $("testBanner").className = "banner " + (pass ? "pass" : "fail");
  $("testBanner").innerHTML = `<b>${t.id}</b> — ${esc(t.what)}<br>Expected: <b>${t.expect}</b> · Actual: <b>${actual}</b> · ${pass ? "✓ PASS" : "✗ FAIL"}`;
  document.querySelectorAll(".tbtn").forEach((b, k) => b.classList.toggle("on", k === i));
  $("sec1").scrollIntoView({ behavior: "smooth" });
}
function runAll() {
  const res = TESTS.map(t => evaluate(t.g, t.str) === t.expect), n = res.filter(Boolean).length;
  $("testBanner").hidden = false; $("testBanner").className = "banner " + (n === TESTS.length ? "pass" : "fail");
  $("testBanner").innerHTML = `<b>All verification tests:</b> ${n} / ${TESTS.length} passed ${n === TESTS.length ? "✓" : "✗"}`;
}
function copyRLG() {
  const t = $("rlgOut").textContent, b = $("btnCopy");
  const done = ok => { b.textContent = ok ? "Copied ✓" : "Select the text and copy"; setTimeout(() => { b.textContent = "Copy RLG"; }, 1500); };
  try { navigator.clipboard.writeText(t).then(() => done(true), () => done(false)); } catch (e) { done(false); }
}

function init() {
  $("testBtns").innerHTML = TESTS.map((t, i) => `<button class="tbtn${t.bad ? " bad" : ""}" data-i="${i}"><b>${t.id}:</b> ${esc(t.label)}</button>`).join("");
  $("testBtns").addEventListener("click", e => { const b = e.target.closest(".tbtn"); if (b) runTest(+b.dataset.i); });
  $("btnAll").onclick = runAll;
  $("btnGen").onclick = () => { generate(); };
  $("btnEx").onclick = () => { $("grammar").value = G1; $("teststr").value = "bba"; generate(); };
  $("btnClear").onclick = () => { $("grammar").value = ""; $("teststr").value = ""; $("validation").hidden = true; $("testBanner").hidden = true; setChips(null); hideResults(); };
  $("btnReset").onclick = () => { $("testBanner").hidden = true; $("grammar").value = LAST || G1; generate(); };
  $("btnTest").onclick = check;
  $("btnCopy").onclick = copyRLG;
  $("teststr").addEventListener("keydown", e => { if (e.key === "Enter") check(); });
  $("grammar").addEventListener("input", () => { $("testBanner").hidden = true; });
  $("grammar").value = G1; $("teststr").value = "bba"; generate();
}
if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);
if (typeof module !== "undefined") module.exports = { parseGrammar, convert, verifyLanguage, wordsOf, checkString, deriveLLG, deriveRLG, drawNFA, evaluate, TESTS, G1 };
