import {
  STATUSES,
  type AppData,
  type Page,
  type Work,
  type Template,
} from "./types";
export function uid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // randomUUID requires HTTPS; getRandomValues also works on a local LAN URL.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join(""),
  ].join("-");
}
export const now = () => new Date().toISOString();
export const joinPrompt = (...parts: (string | undefined)[]) =>
  parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ");
export function createWork(
  name: string,
  characterId = "",
  characterName = "",
): Work {
  const date = now();
  return {
    id: uid(),
    name,
    characterId,
    characterName,
    memo: "",
    commonPrompt: "",
    commonNegative: "",
    createdAt: date,
    updatedAt: date,
    pages: [],
    scenes: [],
  };
}
export function createPage(
  number: number,
  title = "",
  template?: Template,
): Page {
  const date = now();
  return {
    id: uid(),
    number,
    title: title || `ページ ${number}`,
    memo: template?.memo || "",
    sceneId: "",
    prompt: template?.prompt || "",
    negative: template?.negative || "",
    revisionMemo: "",
    status: "未作成",
    reasons: [],
    background: "",
    outfit: "",
    style: "",
    selections: [],
    promptOverride: null,
    negativeOverride: null,
    createdAt: date,
    updatedAt: date,
  };
}
export function duplicatePage(work: Work, page: Page): Page {
  const copy = {
    ...structuredClone(page),
    id: uid(),
    number: page.number + 1,
    title: `${page.title}（複製）`,
    status: "未作成" as const,
    reasons: [],
    revisionMemo: "",
    previewAssetId: undefined,
    createdAt: now(),
    updatedAt: now(),
  };
  work.pages.splice(work.pages.findIndex((p) => p.id === page.id) + 1, 0, copy);
  work.pages.forEach((p, i) => (p.number = i + 1));
  return copy;
}
export function parseBulkPages(
  text: string,
  start: number,
  template?: Template,
): Page[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const match = line.match(/^\s*\d+\s*[|｜]\s*(.*)$/);
      return createPage(start + i, match ? match[1].trim() : line, template);
    });
}
export function assemblePrompt(data: AppData, work: Work, page: Page) {
  const char = data.characters.find((c) => c.id === work.characterId);
  const scene = work.scenes.find((s) => s.id === page.sceneId);
  const selected = page.selections
    .map((s) => (s.weight === 1 ? s.text : `(${s.text}:${s.weight})`))
    .join(", ");
  return {
    prompt: joinPrompt(
      work.commonPrompt,
      char?.prompt,
      scene?.background,
      scene?.outfit,
      scene?.time,
      scene?.lighting,
      scene?.prompt,
      page.background,
      page.outfit,
      page.style,
      page.prompt,
      selected,
    ),
    negative: joinPrompt(
      work.commonNegative,
      char?.negative,
      scene?.negative,
      page.negative,
    ),
  };
}
export function progress(work: Work) {
  const counts = Object.fromEntries(
    STATUSES.map((s) => [s, work.pages.filter((p) => p.status === s).length]),
  ) as Record<(typeof STATUSES)[number], number>;
  const total = work.pages.length;
  return {
    counts,
    total,
    completed: counts["完成"],
    percent: total ? Math.floor((counts["完成"] / total) * 100) : 0,
  };
}
export function productionQueue(
  work: Work,
  scope: "unfinished" | "regenerate" = "unfinished",
) {
  return work.pages
    .filter((p) =>
      scope === "regenerate" ? p.status === "再生成" : p.status !== "完成",
    )
    .sort((a, b) => a.number - b.number);
}
export function applyRange(
  work: Work,
  from: number,
  to: number,
  patch: Partial<Pick<Page, "sceneId" | "background" | "outfit" | "style">>,
) {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 1 ||
    to < from ||
    to > work.pages.length
  )
    throw new Error("有効なページ範囲を指定してください。");
  for (const page of work.pages)
    if (page.number >= from && page.number <= to)
      Object.assign(page, patch, { updatedAt: now() });
  work.updatedAt = now();
}
export function togglePrompt(data: AppData, page: Page, promptId: string) {
  const index = page.selections.findIndex((s) => s.promptId === promptId);
  if (index >= 0) page.selections.splice(index, 1);
  else {
    const entry = data.dictionary.find((p) => p.id === promptId);
    if (!entry) return;
    page.selections.push({ promptId, text: entry.text, weight: 1 });
    entry.uses++;
    entry.lastUsedAt = now();
  }
  page.updatedAt = now();
}
