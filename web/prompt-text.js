/**
 * Prompt Pocket text engine.
 * Text is authoritative. Each dictionary selection owns an exact UTF-16 span.
 * Manual text is never rebuilt from the dictionary, and unowned duplicate words
 * are never selected as a substitute for a removed owned occurrence.
 */

const OPEN = "([{";
const CLOSE = ")]}";
const NUMBER = "(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
const WEIGHT_TAIL = new RegExp("^([\\s\\S]*):\\s*(" + NUMBER + ")\\s*$");
const PARTIAL_TAIL = new RegExp("^([\\s\\S]*):\\s*(" + NUMBER + ")?\\s*$");

const norm = (value) => String(value || "").replace(/\s+/g, " ").trim();

function escapedAt(text, index) {
  let slashes = 0;
  for (let p = index - 1; p >= 0 && text[p] === "\\"; p--) slashes++;
  return slashes % 2 === 1;
}

/** Split on top-level commas, preserving original character offsets. */
export function tokenize(value) {
  const text = String(value || "");
  const result = [];
  const stack = [];
  let start = 0;
  function push(a, b) {
    while (a < b && /\s/.test(text[a])) a++;
    while (b > a && /\s/.test(text[b - 1])) b--;
    if (b > a) result.push({ start: a, end: b, text: text.slice(a, b) });
  }
  for (let i = 0; i < text.length; i++) {
    if (escapedAt(text, i)) continue;
    const ch = text[i];
    const opening = OPEN.indexOf(ch);
    const closing = CLOSE.indexOf(ch);
    if (opening !== -1) stack.push(ch);
    else if (closing !== -1 && stack.length) {
      if (stack[stack.length - 1] === OPEN[closing]) stack.pop();
    } else if (ch === "," && !stack.length) {
      push(start, i);
      start = i + 1;
    }
  }
  push(start, text.length);
  return result;
}

function wrappedInParens(value) {
  if (!value.startsWith("(") || !value.endsWith(")")) return false;
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    if (escapedAt(value, i)) continue;
    if (value[i] === "(") depth++;
    else if (value[i] === ")") {
      depth--;
      if (depth === 0 && i !== value.length - 1) return false;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

export function isValidWeight(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 10;
}

/** Keep all significant digits; small positive weights must not round to zero. */
export function formatWeight(value) {
  if (!isValidWeight(value)) throw new RangeError("重みは0より大きく10以下で入力してください");
  const raw = String(value);
  if (!/[eE]/.test(raw)) return raw;
  const parts = raw.toLowerCase().split("e");
  const exponent = Number(parts[1]);
  const digits = parts[0].replace(".", "");
  const dot = parts[0].includes(".") ? parts[0].indexOf(".") : parts[0].length;
  const position = dot + exponent;
  if (position <= 0) return "0." + "0".repeat(-position) + digits;
  if (position >= digits.length) return digits + "0".repeat(position - digits.length);
  return digits.slice(0, position) + "." + digits.slice(position);
}

export function stripWeight(value) {
  const text = String(value || "").trim();
  if (!wrappedInParens(text)) return text;
  const match = text.slice(1, -1).match(WEIGHT_TAIL);
  return match ? match[1].trim() : text;
}

function decode(value) {
  let text = String(value || "").trim();
  let weight = 1;
  let explicit = false;
  let partial = false;
  for (let i = 0; i < 8; i++) {
    if (wrappedInParens(text)) {
      const inner = text.slice(1, -1).trim();
      const weighted = inner.match(WEIGHT_TAIL);
      if (weighted) {
        const number = Number(weighted[2]);
        weight = isValidWeight(number) ? number : undefined;
        explicit = true;
        text = weighted[1].trim();
      } else {
        text = inner;
      }
      continue;
    }
    if (text.startsWith("(")) {
      const inner = text.slice(1).trim();
      const unfinished = inner.match(PARTIAL_TAIL);
      if (unfinished) {
        text = unfinished[1].trim();
        partial = true;
        explicit = true;
        weight = undefined;
      } else {
        text = inner;
        partial = true;
      }
    }
    break;
  }
  return { base: text, weight, explicit, partial };
}

function canonical(value) {
  return tokenize(decode(value).base).map((part) => norm(part.text)).join(", ");
}

export function renderSelection(selection) {
  const prompt = String(selection.prompt || "").trim();
  const weight = isValidWeight(selection.weight) ? selection.weight : 1;
  if (weight === 1) return stripWeight(prompt);
  return "(" + stripWeight(prompt) + ":" + formatWeight(weight) + ")";
}

function candidateAt(text, span, selection) {
  if (!validSpan(span, text)) return null;
  const parsed = decode(text.slice(span.start, span.end));
  if (canonical(parsed.base) !== canonical(selection.prompt)) return null;
  return { start: span.start, end: span.end, weight: parsed.weight, partial: parsed.partial };
}

function validSpan(span, text) {
  return !!span && Number.isInteger(span.start) && Number.isInteger(span.end) &&
    span.start >= 0 && span.end > span.start && span.end <= text.length;
}

function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

/** Find equivalent whole tokens, including a weighted multiword selection. */
function candidates(text, selection) {
  const base = canonical(selection.prompt);
  if (!base) return [];
  const parts = tokenize(text);
  const count = Math.max(1, tokenize(decode(selection.prompt).base).length);
  const result = [];
  for (let i = 0; i < parts.length; i++) {
    for (let length = 1; length <= count && i + length <= parts.length; length++) {
      const first = parts[i];
      const last = parts[i + length - 1];
      const raw = text.slice(first.start, last.end);
      if (canonical(raw) === base) {
        const parsed = decode(raw);
        result.push({
          start: first.start, end: last.end,
          weight: parsed.weight, partial: parsed.partial
        });
      }
    }
  }
  return result;
}

function withCandidate(selection, candidate) {
  return {
    ...selection,
    weight: !candidate.partial && isValidWeight(candidate.weight)
      ? candidate.weight : (isValidWeight(selection.weight) ? selection.weight : 1),
    span: { start: candidate.start, end: candidate.end }
  };
}

function ordered(selections) {
  return selections.slice().sort((a, b) => a.span.start - b.span.start);
}

/**
 * Restore legacy snapshots without spans. Existing spans are authoritative:
 * when their content is gone, do not steal an identical handwritten token.
 */
export function hydrateDraft(value) {
  const text = typeof value?.text === "string" ? value.text : "";
  const input = Array.isArray(value?.selections) ? value.selections : [];
  const selections = [];
  const occupied = [];
  const keys = new Set();
  for (const original of input) {
    if (!original || !original.key || keys.has(original.key) || !original.prompt) continue;
    let candidate;
    if (original.span) {
      if (validSpan(original.span, text)) {
        candidate = candidateAt(text, original.span, original);
        if (candidate && occupied.some((span) => overlaps(span, candidate))) candidate = null;
      }
    } else {
      candidate = candidates(text, original).find((part) =>
        !occupied.some((span) => overlaps(span, part))
      );
    }
    if (!candidate) continue;
    const selection = withCandidate(original, candidate);
    selections.push(selection);
    occupied.push(selection.span);
    keys.add(selection.key);
  }
  return { text, selections: ordered(selections) };
}

export function findSpans(text, selections) {
  const draft = hydrateDraft({ text, selections });
  const result = new Map(selections.map((selection) => [selection.key, null]));
  for (const selection of draft.selections) result.set(selection.key, { ...selection.span });
  return result;
}

export function appendToken(value, token) {
  const text = String(value || "");
  if (!text.trim()) return token;
  const base = text.replace(/[ \t]+$/, "");
  if (base.endsWith(",")) return base + " " + token;
  if (base.endsWith("\n")) {
    const previous = base.replace(/\s+$/, "");
    return (previous.endsWith(",") ? previous : previous + ",") +
      base.slice(previous.length) + token;
  }
  return base + ", " + token;
}

function removalRange(text, span) {
  let start = span.start;
  let end = span.end;
  let next = end;
  while (next < text.length && /\s/.test(text[next])) next++;
  if (text[next] === ",") {
    next++;
    while (next < text.length && /[ \t]/.test(text[next])) next++;
    end = next;
  } else {
    let previous = start;
    while (previous > 0 && /\s/.test(text[previous - 1])) previous--;
    if (previous > 0 && text[previous - 1] === ",") start = previous - 1;
    else end = next;
  }
  return { start, end };
}

export function removeSpan(text, span) {
  const range = removalRange(text, span);
  return text.slice(0, range.start) + text.slice(range.end);
}

function replaceOwned(draft, selection, replacement, drop) {
  const span = drop ? removalRange(draft.text, selection.span) : selection.span;
  const delta = replacement.length - (span.end - span.start);
  const text = draft.text.slice(0, span.start) + replacement + draft.text.slice(span.end);
  const selections = [];
  for (const existing of draft.selections) {
    if (existing.key === selection.key) {
      if (!drop) selections.push({
        ...existing,
        span: { start: span.start, end: span.start + replacement.length }
      });
    } else if (existing.span.start >= span.end) {
      selections.push({
        ...existing,
        span: { start: existing.span.start + delta, end: existing.span.end + delta }
      });
    } else {
      selections.push({ ...existing, span: { ...existing.span } });
    }
  }
  return { text, selections: ordered(selections) };
}

export function addSelection(value, item) {
  const draft = hydrateDraft(value);
  if (!item || !String(item.prompt || "").trim()) return draft;
  const itemId = item.itemId || item.id || null;
  if (itemId && draft.selections.some((selection) => selection.itemId === itemId)) return draft;
  const key = item.key || ("sel-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2));
  if (draft.selections.some((selection) => selection.key === key)) return draft;
  const selection = {
    key, itemId,
    label: String(item.label || item.name || item.prompt),
    prompt: stripWeight(String(item.prompt)),
    weight: isValidWeight(item.weight) && item.weight !== 1 ? item.weight :
      (decode(item.prompt).explicit && isValidWeight(decode(item.prompt).weight)
        ? decode(item.prompt).weight : 1)
  };
  const rendered = renderSelection(selection);
  const text = appendToken(draft.text, rendered);
  selection.span = { start: text.length - rendered.length, end: text.length };
  return { text, selections: [...draft.selections, selection] };
}

export function removeSelection(value, key) {
  const draft = hydrateDraft(value);
  const selection = draft.selections.find((part) => part.key === key);
  if (!selection) return draft;
  return replaceOwned(draft, selection, "", true);
}

export function setSelectionWeight(value, key, weight) {
  const draft = hydrateDraft(value);
  if (!isValidWeight(weight)) return draft;
  const selection = draft.selections.find((part) => part.key === key);
  if (!selection) return draft;
  const next = { ...selection, weight };
  const result = replaceOwned(draft, selection, renderSelection(next), false);
  result.selections = result.selections.map((part) => part.key === key ? { ...part, weight } : part);
  return result;
}

/** Swap adjacent selected spans while preserving all intervening manual text. */
export function moveSelection(value, key, direction) {
  const draft = hydrateDraft(value);
  if (direction !== -1 && direction !== 1) return draft;
  const index = draft.selections.findIndex((part) => part.key === key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= draft.selections.length) return draft;
  const a = draft.selections[Math.min(index, target)];
  const b = draft.selections[Math.max(index, target)];
  const first = a.span;
  const second = b.span;
  const middle = draft.text.slice(first.end, second.start);
  const firstText = draft.text.slice(first.start, first.end);
  const secondText = draft.text.slice(second.start, second.end);
  const text = draft.text.slice(0, first.start) + secondText + middle + firstText +
    draft.text.slice(second.end);
  const aStart = first.start + secondText.length + middle.length;
  const selections = draft.selections.map((part) => {
    if (part.key === a.key) return {
      ...part, span: { start: aStart, end: aStart + firstText.length }
    };
    if (part.key === b.key) return {
      ...part, span: { start: first.start, end: first.start + secondText.length }
    };
    return { ...part, span: { ...part.span } };
  });
  return { text, selections: ordered(selections) };
}

function inferChange(before, after, hint) {
  if (hint && Number.isInteger(hint.start) && Number.isInteger(hint.end) &&
      hint.start >= 0 && hint.end >= hint.start && hint.end <= before.length &&
      typeof hint.insertedText === "string" &&
      before.slice(0, hint.start) + hint.insertedText + before.slice(hint.end) === after) {
    return {
      start: hint.start, end: hint.end,
      insertedText: hint.insertedText,
      newEnd: hint.start + hint.insertedText.length,
      delta: hint.insertedText.length - (hint.end - hint.start)
    };
  }
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = before.length;
  let newEnd = after.length;
  while (end > start && newEnd > start && before[end - 1] === after[newEnd - 1]) {
    end--;
    newEnd--;
  }
  return {
    start, end, newEnd,
    insertedText: after.slice(start, newEnd),
    delta: newEnd - end
  };
}

function project(span, change) {
  const start = span.start < change.start ? span.start :
    span.start >= change.end ? span.start + change.delta : change.start;
  const end = span.end <= change.start ? span.end :
    span.end >= change.end ? span.end + change.delta : change.newEnd;
  return { start, end: Math.max(start, end) };
}

/**
 * Accept textarea content exactly as entered; reconcile ownership and weights.
 * An optional beforeinput range removes ambiguity when identical words exist.
 */
export function editText(value, newValue, hint) {
  const draft = hydrateDraft(value);
  const text = String(newValue ?? "");
  if (text === draft.text) return draft;
  const change = inferChange(draft.text, text, hint);
  const occupied = [];
  const selections = [];
  const pending = [];
  const replacement = { start: change.start, end: change.newEnd };

  // Preserve provably unchanged occurrences before assigning edited tokens.
  for (const selection of draft.selections) {
    const mapped = project(selection.span, change);
    if (change.start === change.end && change.insertedText) {
      if (change.start === selection.span.start && /^\s*\(+\s*$/.test(change.insertedText)) {
        mapped.start = selection.span.start;
      }
      if (change.start === selection.span.end && !/^[\s,]/.test(change.insertedText)) {
        mapped.end = selection.span.end + change.delta;
      }
    }
    let exact = candidateAt(text, mapped, selection);
    if (exact && occupied.some((span) => overlaps(span, exact))) exact = null;
    const fullyDeleted = change.end > change.start &&
      change.start <= selection.span.start && change.end >= selection.span.end &&
      !change.insertedText.trim();
    if (fullyDeleted) continue;
    if (exact) {
      const next = withCandidate(selection, exact);
      selections.push(next);
      occupied.push(next.span);
    } else {
      pending.push({ selection, mapped, choices: candidates(text, selection) });
    }
  }

  for (const entry of pending) {
    const choices = entry.choices.filter((part) => {
      if (occupied.some((span) => overlaps(span, part))) return false;
      return overlaps(part, entry.mapped) || overlaps(part, replacement) ||
        (part.start === entry.mapped.start && entry.mapped.end > entry.mapped.start);
    });
    choices.sort((a, b) => {
      const scoreA = Math.abs(a.start - entry.mapped.start) + Math.abs(a.end - entry.mapped.end);
      const scoreB = Math.abs(b.start - entry.mapped.start) + Math.abs(b.end - entry.mapped.end);
      return scoreA - scoreB;
    });
    const candidate = choices[0];
    if (!candidate) continue;
    const next = withCandidate(entry.selection, candidate);
    selections.push(next);
    occupied.push(next.span);
  }
  return { text, selections: ordered(selections) };
}

export function parseBulk(value) {
  const result = [];
  for (const line of String(value || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (line.includes("\t")) {
      const parts = line.split("\t");
      let label = parts.shift().trim();
      let prompt = parts.join("\t").trim();
      if (!prompt) prompt = label;
      if (!label) label = prompt;
      if (label && prompt) result.push({ label, prompt });
    } else {
      const prompt = line.trim();
      result.push({ label: prompt, prompt });
    }
  }
  return result;
}
