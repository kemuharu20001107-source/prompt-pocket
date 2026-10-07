import { buildSeed, migrateLegacy } from "./seed";
import { EMPTY_DRAFT, SCHEMA_VERSION, draftSchema, parseAppData, type AppData, type Draft } from "./schema";

export const KEYS = {
  data: "prompt-pocket-data-v1",
  draft: "prompt-pocket-draft-v1",
  recovery: "prompt-pocket-recovery-v1",
  corrupt: "prompt-pocket-corrupt-v1",
  legacy: "prompt-builder-store-v1",
} as const;

export type Status =
  | { phase: "loading" }
  | { phase: "ready"; notice?: string }
  | { phase: "error"; message: string };

export type Loaded = { data: AppData | null; draft: Draft; status: Status };

type KV = Pick<Storage, "getItem" | "setItem">;

/** 読み込み。壊れたデータは上書きせずエラー状態にする。旧キーは読むだけで消さない */
export function loadAll(storage: KV, now = Date.now()): Loaded {
  let draft = EMPTY_DRAFT;
  const rawDraft = storage.getItem(KEYS.draft);
  if (rawDraft) {
    try {
      const p = draftSchema.safeParse(JSON.parse(rawDraft));
      if (p.success) draft = p.data;
    } catch {
      /* 作成途中は破損時のみ空で開始 */
    }
  }
  const raw = storage.getItem(KEYS.data);
  if (raw !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { data: null, draft, status: { phase: "error", message: "保存データが壊れていて読み込めませんでした（JSONエラー）" } };
    }
    const v = (parsed as { schemaVersion?: unknown } | null)?.schemaVersion;
    if (typeof v === "number" && v > SCHEMA_VERSION)
      return { data: null, draft, status: { phase: "error", message: `新しいバージョン（v${v}）のデータです。このバージョンでは開けません` } };
    const r = parseAppData(parsed);
    if (!r.ok) return { data: null, draft, status: { phase: "error", message: `保存データを読み込めませんでした：${r.error}` } };
    return { data: r.data, draft, status: { phase: "ready" } };
  }

  let data: AppData;
  let notice: string | undefined;
  const legacy = storage.getItem(KEYS.legacy);
  if (legacy !== null) {
    try {
      data = migrateLegacy(JSON.parse(legacy), now);
      notice = "以前のデータを引き継ぎました";
    } catch {
      data = buildSeed(false, now);
      notice = "以前のデータを読めなかったため初期データで開始しました（以前のデータは残してあります）";
    }
  } else {
    data = buildSeed(true, now);
  }
  try {
    storage.setItem(KEYS.data, JSON.stringify(data));
  } catch {
    notice = "初期データをこのブラウザに保存できませんでした";
  }
  return { data, draft, status: notice ? { phase: "ready", notice } : { phase: "ready" } };
}
