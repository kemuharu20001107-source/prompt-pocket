import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { KEYS, loadAll, type Loaded } from "./persistence";
import { EMPTY_DRAFT, parseAppData, draftSchema, type AppData, type Draft } from "./schema";

/**
 * モジュール単位の外部ストア。更新関数は常に最新状態を受け取るので
 * 連続更新でも stale closure による取りこぼしが起きない。
 * localStorage への保存が成功してから状態を更新する。
 */
let snap: Loaded = { data: null, draft: EMPTY_DRAFT, status: { phase: "loading" } };
const serverSnap = snap;
const listeners = new Set<() => void>();

function set(p: Partial<Loaded>) {
  snap = { ...snap, ...p };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useStore() {
  return useSyncExternalStore(subscribe, () => snap, () => serverSnap);
}
export const getSnap = () => snap;

export function initStore() {
  if (typeof window === "undefined" || snap.status.phase !== "loading") return;
  const loaded = loadAll(window.localStorage);
  set(loaded);
  if (loaded.status.phase === "ready" && loaded.status.notice) toast(loaded.status.notice);
}

function saveErr(e: unknown) {
  const quota = e instanceof DOMException && /quota/i.test(e.name);
  return quota
    ? "保存容量が足りないため保存できませんでした。画像や履歴を減らしてください"
    : "このブラウザに保存できませんでした（プライベートモードなどの可能性）";
}

export type Fail = { error: string };

export function commit(fn: (d: AppData) => AppData | Fail): boolean {
  const cur = snap.data;
  if (!cur || snap.status.phase !== "ready") {
    toast.error("データを読み込めていないため保存できません（設定を確認してください）");
    return false;
  }
  const next = fn(cur);
  if ("error" in next) {
    toast.error(next.error);
    return false;
  }
  if (next === cur) return true;
  try {
    localStorage.setItem(KEYS.data, JSON.stringify(next));
  } catch (e) {
    toast.error(saveErr(e));
    return false;
  }
  set({ data: next });
  return true;
}

let draftErrShown = false;
export function setDraft(fn: (d: Draft) => Draft) {
  const next = fn(snap.draft);
  if (next === snap.draft) return;
  // 入力を妨げないよう、保存に失敗しても画面上の内容は保持してエラーを出す
  set({ draft: next });
  try {
    localStorage.setItem(KEYS.draft, JSON.stringify(next));
    draftErrShown = false;
  } catch (e) {
    if (!draftErrShown) toast.error(`作成途中の保存に失敗：${saveErr(e)}`);
    draftErrShown = true;
  }
}

/** バックアップ等で全置換。直前の状態は復旧用キーに控える */
export function replaceAll(data: AppData, draft: Draft): boolean {
  const prevData = localStorage.getItem(KEYS.data);
  const prevDraft = localStorage.getItem(KEYS.draft);
  try {
    localStorage.setItem(KEYS.recovery, JSON.stringify({ savedAt: Date.now(), data: prevData, draft: prevDraft }));
  } catch (e) {
    toast.error(`復旧用の控えを保存できないため中止しました：${saveErr(e)}`);
    return false;
  }
  try {
    localStorage.setItem(KEYS.data, JSON.stringify(data));
    localStorage.setItem(KEYS.draft, JSON.stringify(draft));
  } catch (e) {
    try {
      if (prevData === null) localStorage.removeItem(KEYS.data);
      else localStorage.setItem(KEYS.data, prevData);
      if (prevDraft === null) localStorage.removeItem(KEYS.draft);
      else localStorage.setItem(KEYS.draft, prevDraft);
    } catch {
      /* noop */
    }
    toast.error(saveErr(e));
    return false;
  }
  set({ data, draft, status: { phase: "ready" } });
  return true;
}

export function readRecovery(): { savedAt: number; data: AppData; draft: Draft } | null {
  try {
    const raw = localStorage.getItem(KEYS.recovery);
    if (!raw) return null;
    const o = JSON.parse(raw) as { savedAt: number; data: string | null; draft: string | null };
    if (!o.data) return null;
    const r = parseAppData(JSON.parse(o.data));
    if (!r.ok) return null;
    const dr = o.draft ? draftSchema.safeParse(JSON.parse(o.draft)) : null;
    return { savedAt: o.savedAt, data: r.data, draft: dr?.success ? dr.data : EMPTY_DRAFT };
  } catch {
    return null;
  }
}

export function rawSavedData() {
  return localStorage.getItem(KEYS.data);
}

/** 破損データを控えに移してから読み直す */
export function resetCorrupted() {
  const raw = localStorage.getItem(KEYS.data);
  try {
    if (raw !== null) localStorage.setItem(KEYS.corrupt, raw);
  } catch {
    /* 容量不足時は控え無しで続行（画面で事前に書き出しを案内） */
  }
  localStorage.removeItem(KEYS.data);
  const loaded = loadAll(localStorage);
  set(loaded);
}
