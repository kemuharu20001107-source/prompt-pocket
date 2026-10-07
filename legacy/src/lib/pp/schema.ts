import { z } from "zod";

/** 保存データのスキーマバージョン。構造を変えたら上げて移行処理を追加する */
export const SCHEMA_VERSION = 1;
export const OTHER_CATEGORY_ID = "other";
export const HISTORY_LIMIT = 100;

export const weightSchema = z.number().finite().positive().max(10);

export const selectionSchema = z.object({
  key: z.string().min(1),
  itemId: z.string().nullable(),
  label: z.string(),
  prompt: z.string(),
  weight: weightSchema,
});

export const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  emoji: z.string(),
});

export const itemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  prompt: z.string().min(1),
  categoryId: z.string().min(1),
  favorite: z.boolean(),
  note: z.string(),
  usageCount: z.number().int().nonnegative(),
  lastUsedAt: z.number().nullable(),
  image: z.string().startsWith("data:image/").optional(),
  createdAt: z.number(),
});

export const presetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  text: z.string(),
  selections: z.array(selectionSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const historySchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  selections: z.array(selectionSchema),
  copiedAt: z.number(),
});

export const settingsSchema = z.object({
  showImages: z.boolean(),
  sort: z.enum(["default", "usage", "name"]),
});

export const draftSchema = z.object({
  text: z.string(),
  selections: z.array(selectionSchema),
});

export const appDataSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  categories: z.array(categorySchema).min(1),
  items: z.array(itemSchema),
  presets: z.array(presetSchema),
  history: z.array(historySchema),
  settings: settingsSchema,
});

export type Selection = z.infer<typeof selectionSchema>;
export type Category = z.infer<typeof categorySchema>;
export type DictItem = z.infer<typeof itemSchema>;
export type Preset = z.infer<typeof presetSchema>;
export type HistoryEntry = z.infer<typeof historySchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type AppData = z.infer<typeof appDataSchema>;

export const EMPTY_DRAFT: Draft = { text: "", selections: [] };
export const DEFAULT_SETTINGS: Settings = { showImages: false, sort: "default" };

function dup(ids: string[]): string | null {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return null;
}

/** 型検証の後に、ID重複・カテゴリ参照など整合性を検証する */
export function parseAppData(
  input: unknown,
): { ok: true; data: AppData } | { ok: false; error: string } {
  const r = appDataSchema.safeParse(input);
  if (!r.success) {
    const first = r.error.issues[0];
    return { ok: false, error: `形式が正しくありません（${first?.path.join(".") || "root"}: ${first?.message}）` };
  }
  const d = r.data;
  const checks: [string, string[]][] = [
    ["カテゴリ", d.categories.map((c) => c.id)],
    ["辞書項目", d.items.map((i) => i.id)],
    ["プリセット", d.presets.map((p) => p.id)],
    ["履歴", d.history.map((h) => h.id)],
  ];
  for (const [name, ids] of checks) {
    const id = dup(ids);
    if (id) return { ok: false, error: `${name}のIDが重複しています（${id}）` };
  }
  const catIds = new Set(d.categories.map((c) => c.id));
  const orphan = d.items.find((i) => !catIds.has(i.categoryId));
  if (orphan) return { ok: false, error: `「${orphan.label}」のカテゴリが存在しません` };
  return { ok: true, data: { ...d, history: d.history.slice(0, HISTORY_LIMIT) } };
}

export const BACKUP_APP = "prompt-pocket";
export const BACKUP_MAX_BYTES = 20 * 1024 * 1024;

export function buildBackup(data: AppData, draft: Draft) {
  return { app: BACKUP_APP, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data, draft };
}

export function parseBackup(
  text: string,
): { ok: true; data: AppData; draft: Draft } | { ok: false; error: string } {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: "JSONとして読み込めません（ファイルが壊れている可能性があります）" };
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ok: false, error: "バックアップ形式ではありません" };
  const o = obj as Record<string, unknown>;
  if (o.app !== BACKUP_APP) return { ok: false, error: "Prompt Pocket のバックアップではありません" };
  if (typeof o.schemaVersion !== "number") return { ok: false, error: "schemaVersion がありません" };
  if (o.schemaVersion > SCHEMA_VERSION)
    return { ok: false, error: `新しいバージョン（v${o.schemaVersion}）のバックアップには対応していません` };
  if (o.schemaVersion !== SCHEMA_VERSION) return { ok: false, error: `未対応のバージョンです（v${o.schemaVersion}）` };
  const r = parseAppData(o.data);
  if (!r.ok) return r;
  let draft = EMPTY_DRAFT;
  if (o.draft !== undefined) {
    const dr = draftSchema.safeParse(o.draft);
    if (!dr.success) return { ok: false, error: "作成途中データの形式が正しくありません" };
    draft = dr.data;
  }
  return { ok: true, data: r.data, draft };
}
