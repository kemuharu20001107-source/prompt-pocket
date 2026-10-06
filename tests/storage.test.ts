import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createPage, createWork } from "../src/model";
import { initialData } from "../src/seed";
import { exportJSON, importJSON, validateData } from "../src/storage";
import type { AppData } from "../src/types";

function fullFixture(): AppData {
  const data = initialData();
  data.characters.push({
    id: "character-a",
    name: "葵",
    prompt: "blue hair",
    negative: "wrong hair",
    memo: "キャラクターメモ",
  });
  const work = createWork("バックアップ作品", "character-a", "葵");
  work.memo = "構成メモ";
  work.commonPrompt = "masterpiece";
  work.commonNegative = "low quality";
  work.scenes.push({
    id: "scene-a",
    name: "室内",
    background: "office",
    outfit: "suit",
    time: "night",
    lighting: "warm light",
    prompt: "window",
    negative: "daylight",
    memo: "シーンメモ",
  });
  const page = createPage(1, "会話");
  Object.assign(page, {
    sceneId: "scene-a",
    status: "再生成",
    reasons: ["手", "表情"],
    revisionMemo: "手を直す",
    prompt: "talking",
    negative: "bad hands",
    background: "desk",
    outfit: "tie",
    style: "anime style",
    promptOverride: "",
    negativeOverride: "custom negative",
    previewAssetId: "future-preview",
  });
  page.selections = [
    {
      promptId: data.dictionary[0].id,
      text: data.dictionary[0].text,
      weight: 1.3,
    },
  ];
  work.pages.push(page);
  data.works.push(work);
  data.dictionary[0].favorite = true;
  data.dictionary[0].uses = 3;
  data.dictionary[0].lastUsedAt = "2026-10-06T03:00:00.000Z";
  data.dictionary[0].memo = "よく使う視線";
  data.settings = {
    activeWorkId: work.id,
    activePageId: page.id,
    autoAdvance: false,
  };
  return data;
}

function invalidAt(path: string[], value: unknown): (data: AppData) => unknown {
  return (data) => {
    const raw = data as unknown as Record<string, unknown>;
    let cursor = raw;
    for (const key of path.slice(0, -1))
      cursor = cursor[key] as Record<string, unknown>;
    cursor[path.at(-1)!] = value;
    return raw;
  };
}

const invalidBackups: [string, (data: AppData) => unknown][] = [
  ["unsupported schema", invalidAt(["schemaVersion"], 2)],
  ["missing categories array", invalidAt(["categories"], undefined)],
  ["malformed dictionary record", invalidAt(["dictionary", "0", "text"], 42)],
  [
    "duplicate dictionary ID",
    (data) => {
      data.dictionary[1].id = data.dictionary[0].id;
      return data;
    },
  ],
  ["empty work ID", invalidAt(["works", "0", "id"], "")],
  [
    "duplicate scene ID",
    (data) => {
      data.works[0].scenes.push(structuredClone(data.works[0].scenes[0]));
      return data;
    },
  ],
  [
    "duplicate page ID",
    (data) => {
      const page = structuredClone(data.works[0].pages[0]);
      page.number = 2;
      data.works[0].pages.push(page);
      return data;
    },
  ],
  [
    "nonsequential page numbers",
    invalidAt(["works", "0", "pages", "0", "number"], 5),
  ],
  [
    "invalid production status",
    invalidAt(["works", "0", "pages", "0", "status"], "不明"),
  ],
  [
    "malformed regeneration reasons",
    invalidAt(["works", "0", "pages", "0", "reasons"], [1]),
  ],
  [
    "invalid selection weight",
    invalidAt(["works", "0", "pages", "0", "selections", "0", "weight"], 4),
  ],
  [
    "nonfinite selection weight",
    invalidAt(
      ["works", "0", "pages", "0", "selections", "0", "weight"],
      Infinity,
    ),
  ],
  [
    "empty selection ID",
    invalidAt(["works", "0", "pages", "0", "selections", "0", "promptId"], ""),
  ],
  [
    "duplicate selections",
    (data) => {
      data.works[0].pages[0].selections.push(
        structuredClone(data.works[0].pages[0].selections[0]),
      );
      return data;
    },
  ],
  [
    "malformed editable override",
    invalidAt(["works", "0", "pages", "0", "promptOverride"], false),
  ],
  ["invalid date", invalidAt(["works", "0", "createdAt"], "not-a-date")],
  ["negative usage count", invalidAt(["dictionary", "0", "uses"], -1)],
  ["noninteger usage count", invalidAt(["dictionary", "0", "uses"], 1.5)],
  [
    "malformed favorite flag",
    invalidAt(["dictionary", "0", "favorite"], "yes"),
  ],
  [
    "unknown category reference",
    invalidAt(["dictionary", "0", "categoryId"], "missing-category"),
  ],
  [
    "unknown character reference",
    invalidAt(["works", "0", "characterId"], "missing-character"),
  ],
  [
    "unknown scene reference",
    invalidAt(["works", "0", "pages", "0", "sceneId"], "missing-scene"),
  ],
  [
    "unknown active work reference",
    invalidAt(["settings", "activeWorkId"], "missing-work"),
  ],
  [
    "active page outside active work",
    (data) => {
      const work = createWork("別作品");
      const page = createPage(1);
      work.pages.push(page);
      data.works.push(work);
      data.settings.activePageId = page.id;
      return data;
    },
  ],
  ["malformed settings", invalidAt(["settings", "autoAdvance"], "yes")],
];

describe("backup validation and complete restoration", () => {
  it("round-trips every entity, favorites, use history, settings, reasons and direct edits", () => {
    const data = fullFixture();
    const restored = importJSON(exportJSON(data));
    expect(restored).toEqual(data);
    expect(restored).not.toBe(data);
    expect(restored.works[0].pages[0].promptOverride).toBe("");
    expect(restored.works[0].pages[0].negativeOverride).toBe("custom negative");
    restored.works[0].pages[0].selections[0].weight = 0.8;
    expect(data.works[0].pages[0].selections[0].weight).toBe(1.3);
  });

  it("supports a clean installation with no work or active selection", () => {
    const data = initialData();
    expect(importJSON(exportJSON(data))).toEqual(data);
  });

  it("retains historical selection text after its dictionary entry is deleted", () => {
    const data = fullFixture();
    const selection = structuredClone(data.works[0].pages[0].selections[0]);
    data.dictionary = data.dictionary.filter(
      (entry) => entry.id !== selection.promptId,
    );
    expect(
      importJSON(exportJSON(data)).works[0].pages[0].selections[0],
    ).toEqual(selection);
  });

  it.each(invalidBackups)("rejects %s", (_label, corrupt) => {
    expect(() => validateData(corrupt(fullFixture()))).toThrow();
  });

  it("rejects malformed JSON, non-object roots and backups over 20MB", () => {
    expect(() => importJSON("{ broken")).toThrow();
    for (const value of [null, [], false, "text", 1])
      expect(() => validateData(value)).toThrow();
    expect(() => importJSON(" ".repeat(20 * 1024 * 1024 + 1))).toThrow("20MB");
  });
});

describe("IndexedDB persistence", () => {
  let persistence: typeof import("../src/storage");
  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("indexedDB", new IDBFactory());
    persistence = await import("../src/storage");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("loads an empty database, writes a complete snapshot and reads an independent copy", async () => {
    expect(await persistence.loadData()).toBeNull();
    const data = fullFixture();
    await persistence.saveData(data);
    const loaded = await persistence.loadData();
    expect(loaded).toEqual(data);
    data.works[0].name = "未保存の変更";
    expect((await persistence.loadData())!.works[0].name).toBe(
      "バックアップ作品",
    );
    loaded!.works[0].pages[0].title = "別の未保存変更";
    expect((await persistence.loadData())!.works[0].pages[0].title).toBe(
      "会話",
    );
  });

  it("keeps the latest saved snapshot when reopening the storage module", async () => {
    const data = fullFixture();
    await persistence.saveData(data);
    data.works[0].pages[0].status = "完成";
    data.works[0].name = "変更済み";
    await persistence.saveData(data);
    vi.resetModules();
    const reopened = await import("../src/storage");
    expect(await reopened.loadData()).toEqual(data);
  });

  it("leaves the existing persisted snapshot intact after every rejected import", async () => {
    const original = fullFixture();
    await persistence.saveData(original);
    for (const [, corrupt] of invalidBackups) {
      expect(() =>
        persistence.importJSON(JSON.stringify(corrupt(fullFixture()))),
      ).toThrow();
      expect(await persistence.loadData()).toEqual(original);
    }
    expect(() => persistence.importJSON("{ malformed")).toThrow();
    expect(await persistence.loadData()).toEqual(original);
  });

  it("persists a valid restored backup after a full snapshot replacement", async () => {
    await persistence.saveData(initialData());
    const backup = exportJSON(fullFixture());
    await persistence.saveData(persistence.importJSON(backup));
    expect(await persistence.loadData()).toEqual(importJSON(backup));
  });

  it("retains the newest snapshot when several saves are requested without waiting between them", async () => {
    const data = fullFixture();
    const snapshots = ["最初の編集", "次の編集", "最新の編集"].map((name) => {
      const snapshot = structuredClone(data);
      snapshot.works[0].name = name;
      return snapshot;
    });
    await Promise.all(
      snapshots.map((snapshot) => persistence.saveData(snapshot)),
    );
    expect(await persistence.loadData()).toEqual(snapshots[2]);
  });

  it("reports an invalid stored snapshot without deleting the original recoverable data", async () => {
    const invalid = { ...fullFixture(), schemaVersion: 2 };
    await persistence.saveData(invalid as unknown as AppData);
    await expect(persistence.loadData()).rejects.toThrow(
      "対応していないバックアップ",
    );
    const raw = await new Promise<unknown>((resolve, reject) => {
      const opening = indexedDB.open("prompt-pocket", 1);
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const database = opening.result;
        const transaction = database.transaction("snapshots", "readonly");
        const request = transaction.objectStore("snapshots").get("current");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => database.close();
      };
    });
    expect(raw).toEqual(invalid);
  });
});
