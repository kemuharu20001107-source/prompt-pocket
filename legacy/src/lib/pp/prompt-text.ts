/**
 * 完成プロンプトのテキスト操作。完成文（text）を唯一の正とし、
 * 選択項目は「text 内で自分の描画文字列が見つかる位置」を都度探して操作する。
 * 括弧内のカンマは区切りとして扱わない。
 */
import type { Draft, Selection } from "./schema";

export type Token = { start: number; end: number; text: string };

const OPEN = "([{";
const CLOSE = ")]}";

export function tokenize(s: string): Token[] {
  const out: Token[] = [];
  let depth = 0;
  let segStart = 0;
  const push = (a: number, b: number) => {
    while (a < b && /\s/.test(s.charAt(a))) a++;
    while (b > a && /\s/.test(s.charAt(b - 1))) b--;
    if (b > a) out.push({ start: a, end: b, text: s.slice(a, b) });
  };
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (s.charAt(i - 1) === "\\") continue;
    if (OPEN.includes(c)) depth++;
    else if (CLOSE.includes(c)) depth = Math.max(0, depth - 1);
    else if (c === "," && depth === 0) {
      push(segStart, i);
      segStart = i + 1;
    }
  }
  push(segStart, s.length);
  return out;
}

const norm = (t: string) => t.replace(/\s+/g, " ").trim();

/** 文字列全体が1つの丸括弧で包まれているか */
function wrappedInParens(p: string) {
  if (!p.startsWith("(") || !p.endsWith(")")) return false;
  let depth = 0;
  for (let i = 0; i < p.length; i++) {
    if (p.charAt(i) === "(") depth++;
    else if (p.charAt(i) === ")") {
      depth--;
      if (depth === 0 && i !== p.length - 1) return false;
    }
  }
  return depth === 0;
}

/** "(x:1.2)" → "x"。重みが付いていなければそのまま */
export function stripWeight(prompt: string) {
  const p = prompt.trim();
  if (!wrappedInParens(p)) return p;
  const m = p.slice(1, -1).match(/^([\s\S]*):\s*(\d+(?:\.\d+)?)\s*$/);
  return m ? m[1].trim() : p;
}

export function formatWeight(w: number) {
  return String(Number(w.toFixed(2)));
}

export function isValidWeight(w: unknown): w is number {
  return typeof w === "number" && Number.isFinite(w) && w > 0 && w <= 10;
}

export function renderSelection(sel: Pick<Selection, "prompt" | "weight">) {
  if (sel.weight === 1) return sel.prompt.trim();
  return `(${stripWeight(sel.prompt)}:${formatWeight(sel.weight)})`;
}

export type Span = { start: number; end: number };

/** 各選択が text 内のどこにあるか。重複は先頭から順に1か所ずつ割り当てる */
export function findSpans(text: string, selections: Selection[]): Map<string, Span | null> {
  const toks = tokenize(text);
  const used = new Array<boolean>(toks.length).fill(false);
  const result = new Map<string, Span | null>();
  for (const sel of selections) {
    const parts = tokenize(renderSelection(sel)).map((t) => norm(t.text));
    let found: Span | null = null;
    if (parts.length) {
      for (let i = 0; i + parts.length <= toks.length && !found; i++) {
        let ok = true;
        for (let j = 0; j < parts.length; j++) {
          if (used[i + j] || norm(toks[i + j].text) !== parts[j]) {
            ok = false;
            break;
          }
        }
        if (ok) {
          for (let j = 0; j < parts.length; j++) used[i + j] = true;
          found = { start: toks[i].start, end: toks[i + parts.length - 1].end };
        }
      }
    }
    result.set(sel.key, found);
  }
  return result;
}

export function appendToken(text: string, token: string) {
  if (!text.trim()) return token;
  const t = text.replace(/[ \t]+$/, "");
  if (t.endsWith(",")) return `${t} ${token}`;
  if (t.endsWith("\n")) return t + token;
  return `${t}, ${token}`;
}

export function removeSpan(text: string, span: Span) {
  let a = span.start;
  let b = span.end;
  let k = b;
  while (k < text.length && /[ \t]/.test(text.charAt(k))) k++;
  if (text.charAt(k) === ",") {
    k++;
    while (k < text.length && /[ \t]/.test(text.charAt(k))) k++;
    b = k;
  } else {
    let p = a;
    while (p > 0 && /[ \t]/.test(text.charAt(p - 1))) p--;
    if (p > 0 && text.charAt(p - 1) === ",") a = p - 1;
    else b = k;
  }
  return text.slice(0, a) + text.slice(b);
}

// ---- Draft 操作（純粋関数） ----

export function addSelection(d: Draft, sel: Selection): Draft {
  return { text: appendToken(d.text, renderSelection(sel)), selections: [...d.selections, sel] };
}

export function removeSelection(d: Draft, key: string): Draft {
  const span = findSpans(d.text, d.selections).get(key);
  return {
    text: span ? removeSpan(d.text, span) : d.text,
    selections: d.selections.filter((s) => s.key !== key),
  };
}

export function setSelectionWeight(d: Draft, key: string, weight: number): Draft {
  if (!isValidWeight(weight)) return d;
  const sel = d.selections.find((s) => s.key === key);
  if (!sel) return d;
  const span = findSpans(d.text, d.selections).get(key);
  const next = { ...sel, weight };
  const rendered = renderSelection(next);
  const text = span
    ? d.text.slice(0, span.start) + rendered + d.text.slice(span.end)
    : appendToken(d.text, rendered);
  return { text, selections: d.selections.map((s) => (s.key === key ? next : s)) };
}

export function moveSelection(d: Draft, key: string, dir: -1 | 1): Draft {
  const i = d.selections.findIndex((s) => s.key === key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= d.selections.length) return d;
  const selections = [...d.selections];
  [selections[i], selections[j]] = [selections[j], selections[i]];
  const spans = findSpans(d.text, d.selections);
  const a = spans.get(d.selections[i].key);
  const b = spans.get(d.selections[j].key);
  if (!a || !b) return { ...d, selections };
  const [first, second] = a.start < b.start ? [a, b] : [b, a];
  const t = d.text;
  const text =
    t.slice(0, first.start) +
    t.slice(second.start, second.end) +
    t.slice(first.end, second.start) +
    t.slice(first.start, first.end) +
    t.slice(second.end);
  return { text, selections };
}

/** 手入力された完成文を受け入れ、文中から消えた選択だけ外す（文は一切書き換えない） */
export function editText(d: Draft, text: string): Draft {
  const spans = findSpans(text, d.selections);
  const selections = d.selections.filter((s) => spans.get(s.key));
  return { text, selections: selections.length === d.selections.length ? d.selections : selections };
}

export function parseBulk(text: string): { label: string; prompt: string }[] {
  const out: { label: string; prompt: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (line.includes("\t")) {
      const [a, ...rest] = line.split("\t");
      let label = a.trim();
      let prompt = rest.join("\t").trim();
      if (!prompt) prompt = label;
      if (!label) label = prompt;
      if (label) out.push({ label, prompt });
    } else {
      const v = line.trim();
      out.push({ label: v, prompt: v });
    }
  }
  return out;
}
