import { SCHEMA_VERSION, OTHER_CATEGORY_ID, DEFAULT_SETTINGS, buildSeed, makeItem, migrateLegacy, isLegacyData } from "./seed.js";

export { SCHEMA_VERSION, OTHER_CATEGORY_ID };
export const HISTORY_LIMIT = 100;
export const BACKUP_MAX_BYTES = 20 * 1024 * 1024;
export const KEYS = Object.freeze({
  data: "prompt-pocket-data-v1",
  draft: "prompt-pocket-draft-v1",
  recovery: "prompt-pocket-recovery-v1",
  corrupt: "prompt-pocket-corrupt-v1",
  legacy: "prompt-builder-store-v1",
});
export const emptyDraft = () => ({ text: "", selections: [] });
const clone = value => JSON.parse(JSON.stringify(value));
const ok = extras => ({ ok: true, ...extras });
const fail = error => ({ ok: false, error: String(error) });
const object = x => x !== null && typeof x === "object" && !Array.isArray(x);
const nonempty = x => typeof x === "string" && x.trim().length > 0;
const timestamp = x => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 8640000000000000;
const unique = rows => new Set(rows.map(r => r.id)).size === rows.length;
function assert(condition, message) { if (!condition) throw new Error(message); }
function utf8Bytes(text) {
  let count = 0;
  for (const ch of text) { const cp = ch.codePointAt(0); count += cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4; }
  return count;
}
function messageOf(error) {
  return error && typeof error.message === "string" ? error.message : String(error);
}
function storageError(error) {
  if (error && /quota/i.test(error.name || "")) return "保存容量が足りません。バックアップを書き出してから参考画像や履歴を減らしてください";
  return "このブラウザに保存できません。プライベートモードやサイトの保存設定を確認してください";
}
export function validateDraft(input) {
  try {
    assert(object(input) && typeof input.text === "string" && Array.isArray(input.selections), "作成途中データの形式が正しくありません");
    const keys = new Set();
    for (const selection of input.selections) {
      assert(object(selection) && nonempty(selection.key), "選択項目のキーが正しくありません");
      assert(!keys.has(selection.key), "選択項目のキーが重複しています（" + selection.key + "）");
      keys.add(selection.key);
      assert(selection.itemId === null || nonempty(selection.itemId), "選択項目IDが正しくありません");
      assert(typeof selection.label === "string" && nonempty(selection.prompt), "選択項目の本文が正しくありません");
      assert(typeof selection.weight === "number" && Number.isFinite(selection.weight) && selection.weight > 0 && selection.weight <= 10, "重みは0より大きく10以下にしてください");
      if (selection.span !== undefined) {
        const span = selection.span;
        assert(object(span) && Number.isInteger(span.start) && Number.isInteger(span.end) &&
          span.start >= 0 && span.end >= span.start && span.end <= input.text.length, "選択項目の本文位置が正しくありません");
      }
    }
    return ok({ draft: { text: input.text, selections: input.selections.map(selection => ({
      key: selection.key, itemId: selection.itemId, label: selection.label, prompt: selection.prompt,
      weight: selection.weight, ...(selection.span !== undefined ? { span: { ...selection.span } } : {}),
    })) } });
  } catch (error) { return fail(messageOf(error)); }
}
export function validateData(input) {
  try {
    assert(object(input), "保存データがオブジェクトではありません");
    assert(input.schemaVersion === SCHEMA_VERSION, "未対応のデータバージョンです（" + input.schemaVersion + "）");
    assert(Array.isArray(input.categories) && input.categories.length > 0, "カテゴリがありません");
    for (const category of input.categories)
      assert(object(category) && nonempty(category.id) && nonempty(category.name) && typeof category.emoji === "string", "カテゴリの形式が正しくありません");
    assert(unique(input.categories), "カテゴリIDが重複しています");
    const categoryIds = new Set(input.categories.map(c => c.id));
    assert(Array.isArray(input.items), "辞書一覧の形式が正しくありません");
    for (const item of input.items) {
      assert(object(item) && nonempty(item.id) && nonempty(item.label) && nonempty(item.prompt) && nonempty(item.categoryId), "辞書項目の形式が正しくありません");
      assert(categoryIds.has(item.categoryId), "「" + item.label + "」のカテゴリが存在しません");
      assert(typeof item.favorite === "boolean" && typeof item.note === "string", "辞書項目の設定が正しくありません");
      assert(Number.isSafeInteger(item.usageCount) && item.usageCount >= 0, "使用回数が正しくありません");
      assert(timestamp(item.createdAt) && (item.lastUsedAt === null || timestamp(item.lastUsedAt)), "辞書項目の日時が正しくありません");
      assert(item.image === undefined || (typeof item.image === "string" && item.image.startsWith("data:image/")), "参考画像の形式が正しくありません");
    }
    assert(unique(input.items), "辞書項目IDが重複しています");
    assert(Array.isArray(input.presets) && Array.isArray(input.history), "プリセット・履歴の形式が正しくありません");
    for (const preset of input.presets) {
      assert(object(preset) && nonempty(preset.id) && nonempty(preset.name) && timestamp(preset.createdAt) && timestamp(preset.updatedAt), "プリセットの形式が正しくありません");
      const result = validateDraft(preset);
      assert(result.ok, "プリセット: " + result.error);
    }
    for (const history of input.history) {
      assert(object(history) && nonempty(history.id) && timestamp(history.copiedAt), "履歴の形式が正しくありません");
      const result = validateDraft(history);
      assert(result.ok, "履歴: " + result.error);
    }
    assert(unique(input.presets) && unique(input.history), "プリセット・履歴のIDが重複しています");
    assert(object(input.settings) && typeof input.settings.showImages === "boolean" &&
      ["default", "usage", "name"].includes(input.settings.sort), "設定の形式が正しくありません");
    const data = clone(input);
    data.history = data.history.slice(0, HISTORY_LIMIT);
    return ok({ data });
  } catch (error) { return fail(messageOf(error)); }
}
export function inspectBackup(text) {
  try {
    assert(typeof text === "string" && utf8Bytes(text) <= BACKUP_MAX_BYTES, "バックアップは20MiB以下にしてください");
    const input = JSON.parse(text);
    assert(object(input), "バックアップの形式ではありません");
    let data, draft, legacy = false;
    if (input.app === "prompt-pocket") {
      assert(input.schemaVersion === SCHEMA_VERSION, "未対応のバックアップバージョンです（" + input.schemaVersion + "）");
      const dataResult = validateData(input.data);
      assert(dataResult.ok, dataResult.error);
      const draftResult = validateDraft(input.draft ?? emptyDraft());
      assert(draftResult.ok, draftResult.error);
      data = dataResult.data; draft = draftResult.draft;
    } else if (isLegacyData(input) && !Object.hasOwn(input, "app")) {
      const result = validateData(migrateLegacy(input));
      assert(result.ok, result.error);
      data = result.data; draft = emptyDraft(); legacy = true;
    } else {
      throw new Error("Prompt Pocketのバックアップではありません");
    }
    return ok({ data, draft, legacy, counts: {
      categories: data.categories.length, items: data.items.length,
      presets: data.presets.length, history: data.history.length,
    } });
  } catch (error) {
    if (error instanceof SyntaxError) return fail("JSONとして読み込めません。ファイルが壊れていないか確認してください");
    return fail(messageOf(error));
  }
}
export function buildBackup(data, draft) {
  return { app: "prompt-pocket", schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data, draft };
}
let sequence = 0;
function id(prefix) {
  const uuid = typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : Date.now().toString(36) + "-" + (++sequence).toString(36) + "-" + Math.random().toString(36).slice(2);
  return prefix + "-" + uuid;
}
/**
 * All storage access is guarded, including obtaining window.localStorage.
 * Data commits update memory only after saving; draft failures retain typed text.
 * Import writes a durable recovery journal before either of the two live keys.
 */
export function createStore(options = {}) {
  const suppliedStorage = Object.hasOwn(options, "storage");
  const storageProvider = typeof options.getStorage === "function" ? options.getStorage :
    suppliedStorage ? () => options.storage : () => globalThis.localStorage;
  let state = { data: null, draft: emptyDraft(), status: { phase: "loading" }, persisted: false, draftPersisted: false };
  let expectedData = null, expectedDraft = null, initialized = false;
  const listeners = new Set();
  const notify = () => { for (const fn of listeners) { try { fn(state); } catch (error) { globalThis.console?.error(error); } } };
  const update = patch => { state = { ...state, ...patch }; notify(); };
  function storage() {
    const value = storageProvider();
    if (!value || typeof value.getItem !== "function" || typeof value.setItem !== "function" || typeof value.removeItem !== "function")
      throw new Error("ブラウザの保存機能を利用できません");
    return value;
  }
  function getRaw(storageValue) {
    return { data: storageValue.getItem(KEYS.data), draft: storageValue.getItem(KEYS.draft), legacy: storageValue.getItem(KEYS.legacy) };
  }
  function putRaw(storageValue, key, raw) {
    if (raw === null) storageValue.removeItem(key);
    else storageValue.setItem(key, raw);
  }
  function parseRecovery(raw) {
    const saved = JSON.parse(raw);
    assert(object(saved) && timestamp(saved.savedAt) &&
      (saved.data === null || typeof saved.data === "string") &&
      (saved.draft === null || typeof saved.draft === "string"), "復旧用の控えが壊れています");
    assert(saved.pending === undefined || typeof saved.pending === "boolean", "復旧状態が正しくありません");
    return saved;
  }
  function recoverInterrupted(storageValue) {
    const raw = storageValue.getItem(KEYS.recovery);
    if (raw === null) return false;
    let saved;
    try { saved = parseRecovery(raw); }
    catch { return false; } // A bad old recovery file must not hide valid live data.
    if (!saved.pending) return false;
    putRaw(storageValue, KEYS.data, saved.data);
    putRaw(storageValue, KEYS.draft, saved.draft);
    storageValue.setItem(KEYS.recovery, JSON.stringify({ ...saved, pending: false }));
    return true;
  }
  function init() {
    initialized = true;
    let loadedData = null, loadedDraft = emptyDraft();
    try {
      const target = storage();
      const recovered = recoverInterrupted(target);
      const raw = getRaw(target);
      expectedData = raw.data; expectedDraft = raw.draft;
      if (raw.data !== null) {
        const result = validateData(JSON.parse(raw.data));
        assert(result.ok, "保存データを読み込めません: " + result.error);
        loadedData = result.data;
      }
      if (raw.draft !== null) {
        const result = validateDraft(JSON.parse(raw.draft));
        assert(result.ok, "作成途中データを読み込めません: " + result.error);
        loadedDraft = result.draft;
      }
      let notice = recovered ? "前回中断した読み込みを元に戻しました" : "";
      if (loadedData === null) {
        if (raw.legacy !== null) {
          const result = validateData(migrateLegacy(JSON.parse(raw.legacy)));
          assert(result.ok, result.error);
          loadedData = result.data;
          notice = "以前の辞書を引き継ぎました。以前の保存データも残しています";
        } else {
          loadedData = buildSeed(true);
        }
        const serialized = JSON.stringify(loadedData);
        try {
          target.setItem(KEYS.data, serialized);
          expectedData = serialized;
        } catch (error) {
          update({ data: loadedData, draft: loadedDraft, status: { phase: "ready", notice: storageError(error) },
            persisted: false, draftPersisted: raw.draft !== null });
          return fail(storageError(error));
        }
      }
      update({ data: loadedData, draft: loadedDraft, status: { phase: "ready", ...(notice ? { notice } : {}) },
        persisted: true, draftPersisted: true });
      return ok({ notice });
    } catch (error) {
      // Never save an empty seed over unreadable main, legacy, or draft data.
      update({ data: loadedData, draft: loadedDraft,
        status: { phase: "error", message: "保存データを開けませんでした。元データは変更していません。 " + messageOf(error) },
        persisted: false, draftPersisted: false });
      return fail(state.status.message);
    }
  }
  function ready() {
    return state.status.phase === "ready" && state.data !== null;
  }
  function commit(transform) {
    if (!ready()) return fail("データを読み込めていません。設定から再読込・復旧してください");
    let next, result = {};
    try {
      const output = transform(clone(state.data));
      if (output && output.ok === false) return output;
      next = output?.data ?? output;
      if (output?.result) result = output.result;
      const validated = validateData(next);
      if (!validated.ok) return validated;
      next = validated.data;
      const target = storage();
      if (target.getItem(KEYS.data) !== expectedData)
        return fail("別のタブで辞書が変更されました。作成途中をコピーしてから設定で再読込してください");
      const serialized = JSON.stringify(next);
      target.setItem(KEYS.data, serialized);
      expectedData = serialized;
    } catch (error) { return fail(storageError(error)); }
    update({ data: next, persisted: true, status: { phase: "ready" } });
    return ok(result);
  }
  function setDraft(input) {
    if (!ready()) return fail("データを読み込めていません");
    const result = validateDraft(typeof input === "function" ? input(clone(state.draft)) : input);
    if (!result.ok) return result;
    const next = result.draft;
    try {
      const target = storage();
      if (target.getItem(KEYS.draft) !== expectedDraft) {
        update({ draft: next, draftPersisted: false });
        return fail("別のタブで作成途中が変わっています。この入力は画面に保持しています。コピーしてから再読込してください");
      }
      const serialized = JSON.stringify(next);
      target.setItem(KEYS.draft, serialized);
      expectedDraft = serialized;
      update({ draft: next, draftPersisted: true });
      return ok();
    } catch (error) {
      update({ draft: next, draftPersisted: false });
      return fail("作成途中の保存に失敗しました。入力は画面に保持しています。 " + storageError(error));
    }
  }
  function saveItem(fields, itemId) {
    return commit(data => {
      if (!object(fields) || !nonempty(fields.label) || !nonempty(fields.prompt))
        return fail("表示名とプロンプトを入力してください");
      if (!data.categories.some(c => c.id === fields.categoryId)) return fail("カテゴリを選んでください");
      const old = itemId ? data.items.find(i => i.id === itemId) : null;
      if (itemId && !old) return fail("辞書項目が見つかりません");
      const row = { ...(old ?? makeItem(id("item"), "", "", fields.categoryId, Date.now())),
        label: fields.label.trim(), prompt: fields.prompt.trim(), categoryId: fields.categoryId,
        favorite: fields.favorite ?? old?.favorite ?? false, note: fields.note ?? old?.note ?? "" };
      if (Object.hasOwn(fields, "image")) {
        if (fields.image) row.image = fields.image;
        else delete row.image;
      }
      if (old) data.items = data.items.map(i => i.id === itemId ? row : i);
      else data.items.push(row);
      return { data, result: { item: row, id: row.id } };
    });
  }
  function deleteItem(itemId) {
    return commit(data => {
      if (!data.items.some(i => i.id === itemId)) return fail("辞書項目が見つかりません");
      data.items = data.items.filter(i => i.id !== itemId);
      // Presets, history, and draft retain their copied text and selections.
      return data;
    });
  }
  function addItems(lines, categoryId) {
    if (typeof lines !== "string") return fail("追加するプロンプトを入力してください");
    const rows = [];
    for (const [index, raw] of lines.split(/\r?\n/).entries()) {
      const line = raw.trim();
      if (!line) continue;
      const tab = line.indexOf("\t");
      const label = tab < 0 ? line : line.slice(0, tab).trim();
      const prompt = tab < 0 ? line : line.slice(tab + 1).trim();
      if (!label || !prompt) return fail((index + 1) + "行目の表示名またはプロンプトが空です");
      rows.push({ label, prompt });
    }
    if (!rows.length) return fail("追加するプロンプトを入力してください");
    if (rows.length > 5000) return fail("一度に追加できるのは5000件までです");
    return commit(data => {
      if (!data.categories.some(c => c.id === categoryId)) return fail("カテゴリを選んでください");
      const now = Date.now();
      const added = rows.map(row => makeItem(id("item"), row.label, row.prompt, categoryId, now));
      data.items.push(...added);
      return { data, result: { count: added.length, ids: added.map(row => row.id) } };
    });
  }
  function saveCategory(fields, categoryId) {
    return commit(data => {
      if (!object(fields) || !nonempty(fields.name)) return fail("カテゴリ名を入力してください");
      const old = categoryId ? data.categories.find(c => c.id === categoryId) : null;
      if (categoryId && !old) return fail("カテゴリが見つかりません");
      const row = { id: old?.id ?? id("cat"), name: fields.name.trim(), emoji: fields.emoji ?? old?.emoji ?? "🏷️" };
      if (old) data.categories = data.categories.map(c => c.id === categoryId ? row : c);
      else data.categories.push(row);
      return { data, result: { category: row, id: row.id } };
    });
  }
  function deleteCategory(categoryId) {
    return commit(data => {
      if (!data.categories.some(c => c.id === categoryId)) return fail("カテゴリが見つかりません");
      if (categoryId === OTHER_CATEGORY_ID) return fail("「その他」は項目の移動先として残します。名前や順序は変更できます");
      data.categories = data.categories.filter(c => c.id !== categoryId);
      if (!data.categories.some(c => c.id === OTHER_CATEGORY_ID))
        data.categories.push({ id: OTHER_CATEGORY_ID, name: "その他", emoji: "📦" });
      data.items = data.items.map(i => i.categoryId === categoryId ? { ...i, categoryId: OTHER_CATEGORY_ID } : i);
      return data;
    });
  }
  function moveCategory(categoryId, delta) {
    return commit(data => {
      const index = data.categories.findIndex(c => c.id === categoryId);
      if (index < 0) return fail("カテゴリが見つかりません");
      const next = index + Math.sign(delta);
      if (!Number.isFinite(delta) || next < 0 || next >= data.categories.length) return fail("これ以上移動できません");
      [data.categories[index], data.categories[next]] = [data.categories[next], data.categories[index]];
      return data;
    });
  }
  function toggleFavorite(itemId) {
    return commit(data => {
      const row = data.items.find(i => i.id === itemId);
      if (!row) return fail("辞書項目が見つかりません");
      row.favorite = !row.favorite;
      return data;
    });
  }
  function recordUse(itemId) {
    return commit(data => {
      const row = data.items.find(i => i.id === itemId);
      if (!row) return fail("辞書項目が見つかりません");
      row.usageCount = Math.min(Number.MAX_SAFE_INTEGER, row.usageCount + 1);
      row.lastUsedAt = Date.now();
      return data;
    });
  }
  function savePreset(name, presetId) {
    if (presetId) return renamePreset(presetId, name);
    if (!nonempty(name)) return fail("プリセット名を入力してください");
    if (!state.draft.text.trim()) return fail("完成プロンプトが空です");
    const draft = clone(state.draft);
    return commit(data => {
      const old = presetId ? data.presets.find(p => p.id === presetId) : null;
      if (presetId && !old) return fail("プリセットが見つかりません");
      const now = Date.now();
      const row = { id: old?.id ?? id("preset"), name: name.trim(),
        text: draft.text, selections: draft.selections, createdAt: old?.createdAt ?? now, updatedAt: now };
      if (old) data.presets = data.presets.map(p => p.id === presetId ? row : p);
      else data.presets.unshift(row);
      return { data, result: { id: row.id } };
    });
  }
  function renamePreset(presetId, name) {
    if (!nonempty(name)) return fail("プリセット名を入力してください");
    return commit(data => {
      const row = data.presets.find(p => p.id === presetId);
      if (!row) return fail("プリセットが見つかりません");
      row.name = name.trim(); row.updatedAt = Date.now();
      return data;
    });
  }
  function loadPreset(presetId) {
    const preset = state.data?.presets.find(p => p.id === presetId);
    if (!preset) return fail("プリセットが見つかりません");
    const saved = setDraft({ text: preset.text, selections: preset.selections });
    if (!saved.ok) return saved;
    const itemIds = new Set(preset.selections.map(s => s.itemId).filter(Boolean));
    const usage = commit(data => {
      const now = Date.now();
      data.items = data.items.map(i => itemIds.has(i.id) ? {
        ...i, usageCount: Math.min(Number.MAX_SAFE_INTEGER, i.usageCount + 1), lastUsedAt: now,
      } : i);
      return data;
    });
    return usage.ok ? ok() : ok({ notice: usage.error });
  }
  function deletePreset(presetId) {
    return commit(data => {
      if (!data.presets.some(p => p.id === presetId)) return fail("プリセットが見つかりません");
      data.presets = data.presets.filter(p => p.id !== presetId); return data;
    });
  }
  function recordHistory(input = state.draft) {
    const validated = validateDraft(input);
    if (!validated.ok) return validated;
    if (!validated.draft.text.trim()) return fail("完成プロンプトが空です");
    const draft = validated.draft;
    return commit(data => {
      const row = { id: id("history"), ...draft, copiedAt: Date.now() };
      data.history = [row, ...data.history].slice(0, HISTORY_LIMIT);
      return data;
    });
  }
  function loadHistory(historyId) {
    const row = state.data?.history.find(h => h.id === historyId);
    return row ? setDraft({ text: row.text, selections: row.selections }) : fail("履歴が見つかりません");
  }
  function deleteHistory(historyId) {
    return commit(data => {
      if (!data.history.some(h => h.id === historyId)) return fail("履歴が見つかりません");
      data.history = data.history.filter(h => h.id !== historyId); return data;
    });
  }
  function clearHistory() { return commit(data => ({ ...data, history: [] })); }
  function updateSettings(patch) {
    return commit(data => ({ ...data, settings: { ...data.settings, ...patch } }));
  }
  function exportBackup() {
    if (!state.data) return fail("辞書を読み込めていません。「元の保存データを書き出す」で控えを取得してください");
    const validatedData = validateData(state.data), validatedDraft = validateDraft(state.draft);
    if (!validatedData.ok) return validatedData;
    if (!validatedDraft.ok) return validatedDraft;
    return ok({ text: JSON.stringify(buildBackup(validatedData.data, validatedDraft.draft), null, 2) });
  }
  function rawSavedData() {
    try {
      const target = storage();
      const raw = getRaw(target);
      return ok({ text: JSON.stringify({ app: "prompt-pocket-raw-recovery", savedAt: Date.now(),
        ...raw, recovery: target.getItem(KEYS.recovery), corrupt: target.getItem(KEYS.corrupt) }, null, 2) });
    } catch (error) { return fail(storageError(error)); }
  }
  function replaceAll(data, draft, allowUnreadable = false) {
    const parsedData = validateData(data), parsedDraft = validateDraft(draft);
    if (!parsedData.ok) return parsedData;
    if (!parsedDraft.ok) return parsedDraft;
    let target, previous, journal;
    try {
      target = storage(); previous = getRaw(target);
      if (!allowUnreadable && (previous.data !== expectedData || previous.draft !== expectedDraft))
        return fail("別のタブで保存データが変わりました。再読込してから読み込んでください");
      journal = { savedAt: Date.now(), data: previous.data, draft: previous.draft, legacy: previous.legacy, pending: true };
      // If this durable copy cannot be written, leave all live keys untouched.
      target.setItem(KEYS.recovery, JSON.stringify(journal));
    } catch (error) { return fail("復旧用の控えを保存できないため中止しました。 " + storageError(error)); }
    const serializedData = JSON.stringify(parsedData.data), serializedDraft = JSON.stringify(parsedDraft.draft);
    try {
      target.setItem(KEYS.data, serializedData);
      target.setItem(KEYS.draft, serializedDraft);
      target.setItem(KEYS.recovery, JSON.stringify({ ...journal, pending: false }));
    } catch (error) {
      let restored = false;
      try {
        putRaw(target, KEYS.data, previous.data);
        putRaw(target, KEYS.draft, previous.draft);
        target.setItem(KEYS.recovery, JSON.stringify({ ...journal, pending: false }));
        restored = true;
      } catch { /* Durable pending journal remains; init will retry the rollback. */ }
      if (!restored) update({ status: { phase: "error",
        message: "読み込み中に保存が失敗しました。元データは復旧用の控えにあります。設定から再読込してください" },
        persisted: false, draftPersisted: false });
      return fail(storageError(error) + (restored ? " 元の保存データに戻しました" : " 復旧用の控えから再読込してください"));
    }
    expectedData = serializedData; expectedDraft = serializedDraft;
    update({ data: parsedData.data, draft: parsedDraft.draft, status: { phase: "ready" }, persisted: true, draftPersisted: true });
    return ok();
  }
  function importBackup(text) {
    const result = inspectBackup(text);
    if (!result.ok) return result;
    return replaceAll(result.data, result.draft, state.status.phase === "error");
  }
  function readRecovery() {
    try {
      const raw = storage().getItem(KEYS.recovery);
      assert(raw !== null, "復旧用の控えはありません");
      const saved = parseRecovery(raw);
      let data;
      if (saved.data === null) data = saved.legacy ? migrateLegacy(JSON.parse(saved.legacy), saved.savedAt) : buildSeed(true, saved.savedAt);
      else {
        const result = validateData(JSON.parse(saved.data));
        assert(result.ok, "復旧用の辞書: " + result.error);
        data = result.data;
      }
      const draftResult = validateDraft(saved.draft === null ? emptyDraft() : JSON.parse(saved.draft));
      assert(draftResult.ok, draftResult.error);
      return ok({ savedAt: saved.savedAt, data, draft: draftResult.draft });
    } catch (error) { return fail(messageOf(error)); }
  }
  function restoreRecovery() {
    const result = readRecovery();
    return result.ok ? replaceAll(result.data, result.draft, true) : result;
  }
  function startFresh() {
    try {
      const target = storage(), raw = getRaw(target);
      if (raw.data !== null || raw.draft !== null || raw.legacy !== null)
        target.setItem(KEYS.corrupt, JSON.stringify({ savedAt: Date.now(), ...raw }));
      // Archiving errors are caught before touching any current live key.
      return replaceAll(buildSeed(true), emptyDraft(), true);
    } catch (error) { return fail("元データの控えを保存できないため初期化を中止しました。 " + storageError(error)); }
  }
  return {
    getSnapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    init, retry: init, setDraft, saveItem, deleteItem, addItems,
    saveCategory, deleteCategory, moveCategory, toggleFavorite, recordUse,
    savePreset, renamePreset, loadPreset, deletePreset,
    recordHistory, loadHistory, deleteHistory, clearHistory, updateSettings,
    exportBackup, inspectBackup, importBackup, readRecovery, restoreRecovery,
    rawSavedData, startFresh,
    get initialized() { return initialized; },
  };
}
