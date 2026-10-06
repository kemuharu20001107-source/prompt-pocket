import { readFile } from "node:fs/promises";
import {
  test as base,
  expect,
  type Page,
  type Locator,
} from "@playwright/test";
import type { AppData } from "../src/types";

// Every test receives a fresh browser context, including an empty IndexedDB.
const test = base.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await use(errors);
      expect(errors, "Browser console and uncaught errors").toEqual([]);
    },
    { auto: true },
  ],
});

async function tab(page: Page, name: string) {
  const nav =
    (page.viewportSize()?.width || 390) >= 800
      ? page.locator(".sidebar nav")
      : page.getByRole("navigation", { name: "メインナビゲーション" });
  await nav.getByRole("button", { name, exact: true }).click();
}

async function accordion(page: Page, text: string) {
  const summary = page.locator("summary").filter({ hasText: text }).first();
  if (
    !(await summary.evaluate((element) =>
      element.parentElement?.hasAttribute("open"),
    ))
  )
    await summary.click();
  return summary.locator("..");
}

async function saved(page: Page) {
  await expect(page.locator(".save-indicator")).toHaveText("保存済み");
}

async function fitsScreen(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        ),
      {
        message: "All content fits the viewport without horizontal scrolling",
      },
    )
    .toBeLessThanOrEqual(1);
}

async function createWork(page: Page, name: string, count = 0, character = "") {
  await tab(page, "作品");
  if (!(await page.getByLabel("新しい作品名", { exact: true }).isVisible())) {
    await page
      .getByRole("button", { name: "＋ 作品を作る", exact: true })
      .click();
  }
  await page.getByLabel("新しい作品名", { exact: true }).fill(name);
  await page
    .getByLabel("最初に作るページ数", { exact: true })
    .fill(String(count));
  if (character)
    await page
      .getByLabel("作品作成時のキャラクター", { exact: true })
      .selectOption({ label: character });
  await page.getByRole("button", { name: "作品を作成", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function openPage(page: Page, title: string) {
  await page.locator(".page-open").filter({ hasText: title }).first().click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
}

async function pageList(page: Page) {
  await page.getByRole("button", { name: "ページ一覧", exact: true }).click();
}

async function setStatus(page: Page, status: string) {
  await page
    .locator(".status-grid")
    .getByRole("button", { name: new RegExp(`^${status}`) })
    .click();
}

async function deleteConfirmed(scope: Locator, name: string) {
  await scope.getByRole("button", { name, exact: true }).click();
  await scope.getByRole("button", { name: "削除する", exact: true }).click();
}

async function rowActions(row: Locator) {
  const summary = row
    .locator("summary")
    .filter({ hasText: "状態・ページ操作" });
  if (
    (await summary.count()) &&
    !(await summary.evaluate((element) =>
      element.parentElement?.hasAttribute("open"),
    ))
  )
    await summary.click();
}

async function addPreset(
  page: Page,
  kind: "組み合わせ" | "キャラクター" | "ページテンプレート",
  name: string,
  prompt: string,
  negative: string,
  memo: string,
) {
  await tab(page, "プリセット");
  await page.getByRole("button", { name: kind, exact: true }).click();
  await page.getByLabel(`新しい${kind}の名前`, { exact: true }).fill(name);
  await page
    .getByLabel(`新しい${kind}のプロンプト`, { exact: true })
    .fill(prompt);
  await page
    .getByLabel(`新しい${kind}のネガティブプロンプト`, { exact: true })
    .fill(negative);
  await page.getByLabel(`新しい${kind}のメモ`, { exact: true }).fill(memo);
  await page
    .getByRole("button", { name: `${kind}を保存`, exact: true })
    .click();
}

function presetCard(page: Page, name: string) {
  return page
    .locator(".presets-view article")
    .filter({ has: page.getByText(name, { exact: true }) });
}

async function downloadBackup(page: Page) {
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "全データを JSON エクスポート", exact: true })
    .click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^prompt-pocket-.*\.json$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  return {
    path: path!,
    data: JSON.parse(await readFile(path!, "utf8")) as AppData,
  };
}

test("作品とページを作り、複製・一括登録・状態管理・削除する", async ({
  page,
}) => {
  await page.goto("/");
  await createWork(page, "朝の物語");
  await accordion(page, "作品設定・共通プロンプト");
  await page.getByLabel("作品名", { exact: true }).fill("朝の物語・改稿");
  await page.getByLabel("作品のキャラクター名", { exact: true }).fill("葵");
  await page.getByLabel("作品メモ", { exact: true }).fill("日常漫画の構成");
  await page
    .getByLabel("作品の共通プロンプト", { exact: true })
    .fill("masterpiece");
  await page
    .getByLabel("作品の共通ネガティブプロンプト", { exact: true })
    .fill("blurry");

  await accordion(page, "ページを追加・一括登録");
  await page.getByLabel("追加ページのタイトル", { exact: true }).fill("導入");
  await page.getByRole("button", { name: "1 ページ追加", exact: true }).click();
  await accordion(page, "構成・ページ設定");
  await page.getByLabel("ページタイトル", { exact: true }).fill("導入・窓辺");
  await page
    .getByLabel("内容 / 構成メモ", { exact: true })
    .fill("窓辺で朝日を見上げる");
  await page
    .getByLabel("ページ固有プロンプト", { exact: true })
    .fill("window, sunrise");
  await page
    .getByLabel("ページのネガティブプロンプト", { exact: true })
    .fill("bad hands");
  await setStatus(page, "完成");
  await pageList(page);
  await expect(
    page.getByRole("progressbar", { name: "作品の完成率" }),
  ).toHaveAttribute("aria-valuenow", "100");
  await rowActions(page.locator(".page-list article").first());
  await page.getByRole("button", { name: "P1 を複製", exact: true }).click();
  await expect(page.locator(".page-list article")).toHaveCount(2);
  await openPage(page, "導入・窓辺（複製）");
  await accordion(page, "構成・ページ設定");
  await expect(page.getByLabel("内容 / 構成メモ", { exact: true })).toHaveValue(
    "窓辺で朝日を見上げる",
  );
  await expect(
    page.getByLabel("ページ固有プロンプト", { exact: true }),
  ).toHaveValue("window, sunrise");
  await accordion(page, "ネガティブプロンプト");
  await expect(
    page.getByLabel("完成ネガティブプロンプト", { exact: true }),
  ).toHaveValue("blurry, bad hands");
  await setStatus(page, "再生成");
  await page.getByRole("button", { name: "手", exact: true }).click();
  await page.getByLabel("修正メモ", { exact: true }).fill("右手を修正する");
  await pageList(page);

  await accordion(page, "ページを追加・一括登録");
  await page
    .getByLabel("一括登録する構成メモ", { exact: true })
    .fill("1|会話\n2|振り向く\n\n表情アップ\n結末");
  await page
    .getByRole("button", { name: "まとめてページを追加", exact: true })
    .click();
  await expect(page.locator(".page-list article")).toHaveCount(6);
  await expect(page.locator(".page-number")).toHaveText([
    "01",
    "02",
    "03",
    "04",
    "05",
    "06",
  ]);
  await expect(
    page.getByRole("progressbar", { name: "作品の完成率" }),
  ).toHaveAttribute("aria-valuenow", "16");
  await page
    .getByRole("region", { name: "作品の進捗" })
    .getByRole("button", { name: /^再生成/ })
    .click();
  await expect(page.locator(".page-list article")).toHaveCount(1);
  await expect(page.locator(".revision-note")).toContainText(
    "手 ／ 右手を修正する",
  );
  await page.getByRole("button", { name: "すべて", exact: true }).click();
  await rowActions(page.locator(".page-list article").last());
  await deleteConfirmed(page.locator(".page-list article").last(), "削除");
  await expect(page.locator(".page-list article")).toHaveCount(5);
  await fitsScreen(page);
  await saved(page);
  await page.reload();
  await page
    .getByRole("button", { name: "朝の物語・改稿", exact: true })
    .click();
  await expect(page.locator(".page-list article")).toHaveCount(5);
  await page.getByRole("button", { name: "← 作品一覧", exact: true }).click();
  const workCard = page
    .locator("article")
    .filter({
      has: page.getByRole("button", { name: "朝の物語・改稿", exact: true }),
    });
  await expect(workCard).toContainText("1 / 5 ページ完成");
  await expect(workCard).toContainText("日常漫画の構成");
  await deleteConfirmed(workCard, "作品を削除");
  await expect(
    page.getByText("まだ作品がありません", { exact: true }),
  ).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(
    page.getByText("まだ作品がありません", { exact: true }),
  ).toBeVisible();
});

test("キャラクター・シーン・範囲設定・テンプレート・組み合わせをプロンプトへ合成する", async ({
  page,
}) => {
  await page.goto("/");
  await addPreset(
    page,
    "キャラクター",
    "葵",
    "blue hair",
    "wrong hair",
    "主人公",
  );
  await presetCard(page, "葵").locator("summary").click();
  await page
    .getByLabel("葵のプロンプト", { exact: true })
    .fill("blue hair, blue eyes");
  await addPreset(
    page,
    "ページテンプレート",
    "窓辺アップ",
    "close-up, window",
    "bad composition",
    "窓辺の表情",
  );
  await presetCard(page, "窓辺アップ").locator("summary").click();
  await page
    .getByLabel("窓辺アップのプロンプト", { exact: true })
    .fill("close-up, window, looking up");
  await addPreset(
    page,
    "組み合わせ",
    "夜景セット",
    "city lights",
    "overexposed",
    "夜景の補助",
  );
  await presetCard(page, "夜景セット").locator("summary").click();
  await page
    .getByLabel("夜景セットのプロンプト", { exact: true })
    .fill("city lights, bokeh");
  await createWork(page, "夜のオフィス", 2, "葵");
  await accordion(page, "作品設定・共通プロンプト");
  await page
    .getByLabel("作品の共通プロンプト", { exact: true })
    .fill("masterpiece, anime style");
  await page
    .getByLabel("作品の共通ネガティブプロンプト", { exact: true })
    .fill("low quality");
  await accordion(page, "シーン設定");
  await page.getByLabel("新しいシーン名", { exact: true }).fill("オフィスの夜");
  await page.getByRole("button", { name: "シーン追加", exact: true }).click();
  await accordion(page, "オフィスの夜");
  await page.getByLabel("オフィスの夜の背景", { exact: true }).fill("office");
  await page
    .getByLabel("オフィスの夜の衣装", { exact: true })
    .fill("business suit");
  await page.getByLabel("オフィスの夜の時間帯", { exact: true }).fill("night");
  await page
    .getByLabel("オフィスの夜のライティング", { exact: true })
    .fill("warm lighting");
  await page
    .getByLabel("オフィスの夜のシーン追加プロンプト", { exact: true })
    .fill("desk");
  await page
    .getByLabel("オフィスの夜のシーンネガティブプロンプト", { exact: true })
    .fill("daylight");
  await accordion(page, "範囲一括設定");
  await page.getByLabel("一括設定の終了ページ", { exact: true }).fill("2");
  await page.getByLabel("シーンを適用", { exact: true }).check();
  await page
    .getByLabel("一括適用するシーン", { exact: true })
    .selectOption({ label: "オフィスの夜" });
  for (const [label, text] of [
    ["背景", "window"],
    ["服装", "necktie"],
    ["画風", "soft colors"],
  ]) {
    await page.getByLabel(`${label}を適用`, { exact: true }).check();
    await page.getByLabel(`一括適用する${label}`, { exact: true }).fill(text);
  }
  await page
    .getByRole("button", { name: "指定範囲へ適用", exact: true })
    .click();
  await fitsScreen(page);
  await openPage(page, "ページ 1");
  await expect(page.getByLabel("完成プロンプト", { exact: true })).toHaveValue(
    "masterpiece, anime style, blue hair, blue eyes, office, business suit, night, warm lighting, desk, window, necktie, soft colors",
  );
  await accordion(page, "ネガティブプロンプト");
  await expect(
    page.getByLabel("完成ネガティブプロンプト", { exact: true }),
  ).toHaveValue("low quality, wrong hair, daylight");
  await pageList(page);
  await accordion(page, "シーン設定");
  await accordion(page, "オフィスの夜");
  await page
    .getByLabel("オフィスの夜のライティング", { exact: true })
    .fill("cool lighting");
  await openPage(page, "ページ 2");
  await expect(page.getByLabel("完成プロンプト", { exact: true })).toHaveValue(
    /cool lighting/,
  );
  await expect(
    page.getByLabel("完成プロンプト", { exact: true }),
  ).not.toHaveValue(/warm lighting/);

  await tab(page, "プリセット");
  await page
    .getByRole("button", { name: "ページテンプレート", exact: true })
    .click();
  await presetCard(page, "窓辺アップ")
    .getByRole("button", { name: "現在のページに適用", exact: true })
    .click();
  await presetCard(page, "窓辺アップ")
    .getByRole("button", { name: "適用する", exact: true })
    .click();
  await page.getByRole("button", { name: "組み合わせ", exact: true }).click();
  await presetCard(page, "夜景セット")
    .getByRole("button", { name: "現在のページに追加", exact: true })
    .click();
  await tab(page, "作品");
  await page.getByRole("button", { name: "夜のオフィス", exact: true }).click();
  await openPage(page, "ページ 2");
  await accordion(page, "構成・ページ設定");
  await expect(page.getByLabel("内容 / 構成メモ", { exact: true })).toHaveValue(
    "窓辺の表情",
  );
  await expect(
    page.getByLabel("ページ固有プロンプト", { exact: true }),
  ).toHaveValue("close-up, window, looking up, city lights, bokeh");
  await accordion(page, "ネガティブプロンプト");
  await expect(
    page.getByLabel("完成ネガティブプロンプト", { exact: true }),
  ).toHaveValue(
    "low quality, wrong hair, daylight, bad composition, overexposed",
  );
  await pageList(page);
  await accordion(page, "ページを追加・一括登録");
  await page
    .getByLabel("追加ページのテンプレート", { exact: true })
    .selectOption({ label: "窓辺アップ" });
  await page
    .getByLabel("追加ページのタイトル", { exact: true })
    .fill("テンプレートから作成");
  await page.getByRole("button", { name: "1 ページ追加", exact: true }).click();
  await expect(page.getByLabel("完成プロンプト", { exact: true })).toHaveValue(
    /close-up, window, looking up/,
  );
  await pageList(page);
  await accordion(page, "シーン設定");
  const scene = await accordion(page, "オフィスの夜");
  await deleteConfirmed(scene, "シーンを削除");
  await openPage(page, "ページ 2");
  await expect(
    page.getByLabel("完成プロンプト", { exact: true }),
  ).not.toHaveValue(/office|cool lighting/);
  await tab(page, "プリセット");
  for (const [kind, name] of [
    ["組み合わせ", "夜景セット"],
    ["ページテンプレート", "窓辺アップ"],
    ["キャラクター", "葵"],
  ]) {
    await page.getByRole("button", { name: kind, exact: true }).click();
    const card = presetCard(page, name);
    await card.locator("summary").click();
    await deleteConfirmed(card, `この${kind}を削除`);
    await expect(presetCard(page, name)).toHaveCount(0);
  }
  await fitsScreen(page);
  // Character deletion keeps the used settings on the work rather than breaking it.
  await tab(page, "作品");
  await page.getByRole("button", { name: "夜のオフィス", exact: true }).click();
  await openPage(page, "ページ 2");
  await expect(page.getByLabel("完成プロンプト", { exact: true })).toHaveValue(
    /blue hair, blue eyes/,
  );
  await expect(page.getByLabel("完成プロンプト", { exact: true })).toHaveValue(
    /city lights, bokeh/,
  );
});

test("辞書の検索・選択・重み・使用履歴と直接編集・コピー・ページ移動を使う", async ({
  page,
}) => {
  await page.goto("/");
  await createWork(page, "辞書テスト", 2);
  await openPage(page, "ページ 1");
  await tab(page, "辞書");
  await accordion(page, "カテゴリを管理");
  await page.getByLabel("新しいカテゴリ名", { exact: true }).fill("テスト視線");
  await page
    .getByRole("button", { name: "カテゴリを追加", exact: true })
    .click();
  await page
    .getByLabel("テスト視線カテゴリ名", { exact: true })
    .fill("カスタム視線");
  await accordion(page, "プロンプトを登録");
  await page
    .getByLabel("新しいプロンプトの表示名", { exact: true })
    .fill("窓を見る");
  await page
    .getByLabel("新しい出力プロンプト", { exact: true })
    .fill("looking at window");
  await page
    .getByLabel("新しいプロンプトのカテゴリ", { exact: true })
    .selectOption({ label: "カスタム視線" });
  await page
    .getByLabel("新しいプロンプトのメモ", { exact: true })
    .fill("窓の方向に視線");
  await page.getByRole("button", { name: "辞書に登録", exact: true }).click();
  await page.getByLabel("プロンプトを検索", { exact: true }).fill("窓を見る");
  await expect(page.locator(".dictionary-list article")).toHaveCount(1);
  await page
    .getByLabel("プロンプトを検索", { exact: true })
    .fill("LOOKING AT WINDOW");
  await expect(page.locator(".dictionary-list article")).toHaveCount(1);
  await page
    .getByRole("button", { name: "窓を見るをページに追加", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "窓を見るを選択解除", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "窓を見るを選択解除", exact: true })
    .click();
  await page
    .getByRole("button", { name: "窓を見るをページに追加", exact: true })
    .click();
  await page
    .getByRole("button", { name: "窓を見るのお気に入り登録", exact: true })
    .click();
  await page.getByRole("button", { name: "★ お気に入り", exact: true }).click();
  await expect(page.locator(".dictionary-list article")).toHaveCount(1);
  await page.getByRole("button", { name: "最近使用", exact: true }).click();
  await expect(page.locator(".dictionary-list article")).toHaveCount(1);
  await expect(page.locator(".dictionary-list article")).toContainText(
    "2 回使用",
  );
  await page.getByRole("button", { name: "すべて", exact: true }).click();
  await page.getByLabel("プロンプトを検索", { exact: true }).fill("");
  await page.getByLabel("辞書の並び順", { exact: true }).selectOption("uses");
  await expect(page.locator(".dictionary-list article").first()).toContainText(
    "窓を見る",
  );
  await page
    .locator('[aria-label="looking at windowの重み"]')
    .getByRole("button", { name: "1.2", exact: true })
    .click();
  await page
    .getByLabel("looking at windowの重みを手入力", { exact: true })
    .fill("1.35");
  await page
    .getByLabel("looking at windowの重みを手入力", { exact: true })
    .blur();
  await fitsScreen(page);
  await page.getByLabel("プロンプトを検索", { exact: true }).fill("窓を見る");
  await accordion(page, "窓を見るを編集");
  await page
    .getByLabel("窓を見るの出力プロンプト", { exact: true })
    .fill("looking toward window");
  await tab(page, "作品");
  await page.getByRole("button", { name: "辞書テスト", exact: true }).click();
  await openPage(page, "ページ 1");
  await expect(page.getByLabel("完成プロンプト", { exact: true })).toHaveValue(
    "(looking at window:1.35)",
  );
  await accordion(page, "辞書からタップで追加");
  await page
    .getByLabel("プロンプトを検索", { exact: true })
    .fill("こちらを見る");
  await page
    .getByRole("button", { name: "こちらを見るをページに追加", exact: true })
    .click();
  await expect(page.getByLabel("完成プロンプト", { exact: true })).toHaveValue(
    "(looking at window:1.35), looking at viewer",
  );
  await page
    .getByRole("button", { name: "こちらを見るを選択解除", exact: true })
    .click();
  await expect(page.getByLabel("完成プロンプト", { exact: true })).toHaveValue(
    "(looking at window:1.35)",
  );
  await tab(page, "プリセット");
  await page
    .getByRole("button", { name: "現在のページから読み込む", exact: true })
    .click();
  await expect(
    page.getByLabel("新しい組み合わせのプロンプト", { exact: true }),
  ).toHaveValue("(looking at window:1.35)");
  await tab(page, "作品");
  await page.getByRole("button", { name: "辞書テスト", exact: true }).click();
  await openPage(page, "ページ 1");
  await page
    .getByLabel("完成プロンプト", { exact: true })
    .fill("manual prompt, night");
  await page
    .getByRole("button", { name: "プロンプトをコピー", exact: true })
    .click();
  await expect(page.getByText("コピーしました", { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("manual prompt, night");
  await accordion(page, "ネガティブプロンプト");
  await page
    .getByLabel("完成ネガティブプロンプト", { exact: true })
    .fill("manual negative");
  await page
    .getByRole("button", { name: "ネガティブをコピー", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("manual negative");
  await tab(page, "プリセット");
  await page
    .getByRole("button", { name: "現在のページから読み込む", exact: true })
    .click();
  await expect(
    page.getByLabel("新しい組み合わせのプロンプト", { exact: true }),
  ).toHaveValue("manual prompt, night");
  await expect(
    page.getByLabel("新しい組み合わせのネガティブプロンプト", { exact: true }),
  ).toHaveValue("manual negative");
  await tab(page, "作品");
  await page.getByRole("button", { name: "辞書テスト", exact: true }).click();
  await openPage(page, "ページ 1");
  await saved(page);
  await page.getByRole("button", { name: "次ページ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ページ 2", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "前ページ", exact: true }).click();
  await expect(page.getByLabel("完成プロンプト", { exact: true })).toHaveValue(
    "manual prompt, night",
  );
  await page
    .getByRole("button", { name: "自動生成に戻す", exact: true })
    .click();
  await expect(page.getByLabel("完成プロンプト", { exact: true })).toHaveValue(
    "(looking at window:1.35)",
  );
  await page
    .getByLabel("編集ページへ移動", { exact: true })
    .selectOption({ label: "P2 ページ 2" });
  await expect(
    page.getByRole("heading", { name: "ページ 2", exact: true }),
  ).toBeVisible();
  await fitsScreen(page);
  await tab(page, "辞書");
  await accordion(page, "カテゴリを管理");
  const categoryRow = page
    .locator(".row")
    .filter({
      has: page.getByLabel("カスタム視線カテゴリ名", { exact: true }),
    });
  await deleteConfirmed(categoryRow, "削除");
  await page.getByLabel("プロンプトを検索", { exact: true }).fill("窓を見る");
  await expect(page.locator(".dictionary-list article")).toContainText(
    "その他",
  );
  const entry = await accordion(page, "窓を見るを編集");
  await deleteConfirmed(entry, "このプロンプトを削除");
  await expect(page.locator(".dictionary-list article")).toHaveCount(0);
  await tab(page, "作品");
  await page.getByRole("button", { name: "辞書テスト", exact: true }).click();
  await openPage(page, "ページ 1");
  await expect(page.getByLabel("完成プロンプト", { exact: true })).toHaveValue(
    "(looking at window:1.35)",
  );
});

test("制作モードで自動移動し、再生成理由を記録して対象ページだけ作り直す", async ({
  page,
}) => {
  await page.goto("/");
  await createWork(page, "制作テスト", 3);
  await page
    .getByRole("button", { name: "▶ 制作モードを開始", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ページ 1", exact: true }),
  ).toBeVisible();
  await setStatus(page, "プロンプト完成");
  await expect(
    page.getByRole("heading", { name: "ページ 2", exact: true }),
  ).toBeVisible();
  await setStatus(page, "再生成");
  await expect(
    page.getByRole("heading", { name: "ページ 2", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "手", exact: true }).click();
  await page.getByRole("button", { name: "表情", exact: true }).click();
  await page.getByLabel("修正メモ", { exact: true }).fill("指と笑顔を作り直す");
  await page
    .getByRole("button", { name: "理由を記録して次へ", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ページ 3", exact: true }),
  ).toBeVisible();
  await setStatus(page, "完成");
  await expect(
    page.getByRole("heading", {
      name: "ひと区切り、おつかれさま。",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "もう一度確認する", exact: true })
    .click();
  await page.getByRole("button", { name: "再生成だけ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ページ 2", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "手", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "表情", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("修正メモ", { exact: true })).toHaveValue(
    "指と笑顔を作り直す",
  );
  await setStatus(page, "完成");
  await page.getByRole("button", { name: "ページ一覧へ", exact: true }).click();
  await expect(
    page.getByRole("progressbar", { name: "作品の完成率" }),
  ).toHaveAttribute("aria-valuenow", "66");
  await page
    .getByRole("button", { name: "▶ 制作モードを開始", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ページ 1", exact: true }),
  ).toBeVisible();
  await tab(page, "設定");
  await page
    .getByLabel("状態を変更したら次のページへ進む", { exact: true })
    .uncheck();
  await tab(page, "制作");
  await setStatus(page, "生成済み");
  await expect(
    page.getByRole("heading", { name: "ページ 1", exact: true }),
  ).toBeVisible();
  await setStatus(page, "採用");
  await expect(
    page.getByRole("heading", { name: "ページ 1", exact: true }),
  ).toBeVisible();
  await setStatus(page, "完成");
  await expect(
    page.getByRole("heading", { name: "ページ 1", exact: true }),
  ).toBeVisible();
  await pageList(page);
  await expect(
    page.getByRole("progressbar", { name: "作品の完成率" }),
  ).toHaveAttribute("aria-valuenow", "100");
  await fitsScreen(page);
  await saved(page);
  await page.reload();
  await page.getByRole("button", { name: "制作テスト", exact: true }).click();
  await expect(
    page.getByRole("progressbar", { name: "作品の完成率" }),
  ).toHaveAttribute("aria-valuenow", "100");
});

test("自動移動オフでは完成・再生成対象外に変更しても、編集中のページを保持する", async ({
  page,
}) => {
  await page.goto("/");
  await createWork(page, "手動制作テスト", 2);
  await tab(page, "設定");
  await page
    .getByLabel("状態を変更したら次のページへ進む", { exact: true })
    .uncheck();
  await tab(page, "制作");
  await expect(
    page.getByRole("heading", { name: "ページ 1", exact: true }),
  ).toBeVisible();
  await setStatus(page, "完成");
  await expect(
    page.getByRole("heading", { name: "ページ 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "ひと区切り、おつかれさま。",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByLabel("完成プロンプト", { exact: true })
    .fill("still editing completed page one");
  await expect(page.getByLabel("完成プロンプト", { exact: true })).toHaveValue(
    "still editing completed page one",
  );
  await page.getByRole("button", { name: "次ページ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ページ 2", exact: true }),
  ).toBeVisible();
  await setStatus(page, "完成");
  await expect(
    page.getByRole("heading", { name: "ページ 2", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("完成プロンプト", { exact: true })
    .fill("still editing completed last page");
  await expect(page.getByLabel("完成プロンプト", { exact: true })).toHaveValue(
    "still editing completed last page",
  );
  await expect(
    page.getByRole("heading", {
      name: "ひと区切り、おつかれさま。",
      exact: true,
    }),
  ).toHaveCount(0);
  await fitsScreen(page);
  await tab(page, "辞書");
  await tab(page, "制作");
  await expect(
    page.getByRole("heading", {
      name: "ひと区切り、おつかれさま。",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "対象ページはすべて完了しました",
      exact: true,
    }),
  ).toBeVisible();

  await createWork(page, "手動再生成テスト", 2);
  await openPage(page, "ページ 1");
  await setStatus(page, "再生成");
  await page.getByRole("button", { name: "次ページ", exact: true }).click();
  await setStatus(page, "再生成");
  await pageList(page);
  await page
    .getByRole("button", { name: "▶ 制作モードを開始", exact: true })
    .click();
  await page.getByRole("button", { name: "再生成だけ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ページ 1", exact: true }),
  ).toBeVisible();
  await setStatus(page, "生成済み");
  await expect(
    page.getByRole("heading", { name: "ページ 1", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("完成プロンプト", { exact: true })
    .fill("generated page remains editable");
  await page.getByRole("button", { name: "次ページ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ページ 2", exact: true }),
  ).toBeVisible();
  await setStatus(page, "生成済み");
  await expect(
    page.getByRole("heading", { name: "ページ 2", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "ひと区切り、おつかれさま。",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "再生成だけ", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "対象ページはすべて完了しました",
      exact: true,
    }),
  ).toBeVisible();
});

test("IndexedDB の保存失敗を表示し、再試行して入力内容を保持する", async ({
  page,
}) => {
  await page.goto("/");
  await createWork(page, "保存再試行テスト", 1);
  await openPage(page, "ページ 1");
  await accordion(page, "構成・ページ設定");
  await saved(page);
  await page.evaluate(() => {
    const runtime = window as typeof window & {
      originalPocketPut?: IDBObjectStore["put"];
    };
    runtime.originalPocketPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("テスト用の保存容量不足", "QuotaExceededError");
    };
  });
  await page
    .getByLabel("内容 / 構成メモ", { exact: true })
    .fill("保存に失敗しても保持する新しい構成");
  await expect(page.locator(".save-indicator")).toHaveText("保存失敗");
  await expect(page.locator(".save-error")).toContainText(
    "変更を保存できていません。",
  );
  await expect(page.locator(".save-error")).toContainText(
    "テスト用の保存容量不足",
  );
  await expect(page.getByLabel("内容 / 構成メモ", { exact: true })).toHaveValue(
    "保存に失敗しても保持する新しい構成",
  );
  // A storage failure must not block an emergency backup of the in-memory edits.
  await tab(page, "設定");
  await expect(page.locator(".save-indicator")).toHaveText("保存失敗");
  const recoveryBackup = await downloadBackup(page);
  expect(recoveryBackup.data.works[0].pages[0].memo).toBe(
    "保存に失敗しても保持する新しい構成",
  );
  await page.evaluate(() => {
    const runtime = window as typeof window & {
      originalPocketPut?: IDBObjectStore["put"];
    };
    if (runtime.originalPocketPut)
      IDBObjectStore.prototype.put = runtime.originalPocketPut;
    delete runtime.originalPocketPut;
  });
  await page
    .locator(".save-error")
    .getByRole("button", { name: "保存を再試行", exact: true })
    .click();
  await saved(page);
  await expect(page.locator(".save-error")).toHaveCount(0);
  await fitsScreen(page);
  await page.reload();
  await page
    .getByRole("button", { name: "保存再試行テスト", exact: true })
    .click();
  await openPage(page, "ページ 1");
  await accordion(page, "構成・ページ設定");
  await expect(page.getByLabel("内容 / 構成メモ", { exact: true })).toHaveValue(
    "保存に失敗しても保持する新しい構成",
  );
});

test("randomUUID と Clipboard API がない環境でも作成・コピー・保存が動く", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", {
      value: undefined,
      configurable: true,
    });
    const runtime = window as typeof window & {
      originalPocketClipboard?: Clipboard;
    };
    runtime.originalPocketClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto("/");
  await tab(page, "辞書");
  await expect(
    page.getByRole("heading", { name: "プロンプト辞書", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "こちらを見るをページに追加",
      exact: true,
    }),
  ).toBeVisible();
  await createWork(page, "互換性テスト", 1);
  await openPage(page, "ページ 1");
  await accordion(page, "構成・ページ設定");
  await page
    .getByLabel("ページタイトル", { exact: true })
    .fill("互換性を確認するページ");
  await page
    .getByLabel("内容 / 構成メモ", { exact: true })
    .fill("Safari や LAN から開いた場合に備える");
  await page
    .getByLabel("完成プロンプト", { exact: true })
    .fill("fallback prompt, window");
  await page
    .getByRole("button", { name: "プロンプトをコピー", exact: true })
    .click();
  await expect(page.getByText("コピーしました", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const runtime = window as typeof window & {
          originalPocketClipboard?: Clipboard;
        };
        return runtime.originalPocketClipboard?.readText();
      }),
    )
    .toBe("fallback prompt, window");
  await expect(page.getByLabel("完成プロンプト", { exact: true })).toHaveValue(
    "fallback prompt, window",
  );
  await fitsScreen(page);
  await saved(page);
  await page.reload();
  await page.getByRole("button", { name: "互換性テスト", exact: true }).click();
  await openPage(page, "互換性を確認するページ");
  await accordion(page, "構成・ページ設定");
  await expect(page.getByLabel("内容 / 構成メモ", { exact: true })).toHaveValue(
    "Safari や LAN から開いた場合に備える",
  );
  await expect(page.getByLabel("完成プロンプト", { exact: true })).toHaveValue(
    "fallback prompt, window",
  );
  await fitsScreen(page);
});

test("全データを JSON に書き出し、安全に復元し、再読み込み・PC 幅でも保持する", async ({
  page,
}) => {
  await page.goto("/");
  await addPreset(
    page,
    "キャラクター",
    "復元キャラ",
    "silver hair",
    "red hair",
    "キャラメモ",
  );
  await addPreset(
    page,
    "ページテンプレート",
    "復元テンプレ",
    "close-up",
    "wide shot",
    "テンプレメモ",
  );
  await addPreset(
    page,
    "組み合わせ",
    "復元セット",
    "best quality",
    "low quality",
    "プリセットメモ",
  );
  await createWork(page, "バックアップ作品", 2, "復元キャラ");
  await accordion(page, "作品設定・共通プロンプト");
  await page.getByLabel("作品メモ", { exact: true }).fill("復元される作品メモ");
  await page
    .getByLabel("作品の共通プロンプト", { exact: true })
    .fill("anime style");
  await accordion(page, "シーン設定");
  await page.getByLabel("新しいシーン名", { exact: true }).fill("復元シーン");
  await page.getByRole("button", { name: "シーン追加", exact: true }).click();
  await accordion(page, "復元シーン");
  await page.getByLabel("復元シーンの背景", { exact: true }).fill("library");
  await openPage(page, "ページ 1");
  await accordion(page, "構成・ページ設定");
  await page
    .getByLabel("ページのシーン", { exact: true })
    .selectOption({ label: "復元シーン" });
  await page
    .getByLabel("内容 / 構成メモ", { exact: true })
    .fill("本棚の前で微笑む");
  await tab(page, "辞書");
  await page
    .getByLabel("プロンプトを検索", { exact: true })
    .fill("こちらを見る");
  await page
    .getByRole("button", { name: "こちらを見るをページに追加", exact: true })
    .click();
  await page
    .getByRole("button", { name: "こちらを見るのお気に入り登録", exact: true })
    .click();
  await page
    .locator('[aria-label="looking at viewerの重み"]')
    .getByRole("button", { name: "1.4", exact: true })
    .click();
  await tab(page, "作品");
  await page
    .getByRole("button", { name: "バックアップ作品", exact: true })
    .click();
  await openPage(page, "ページ 1");
  await page
    .getByLabel("完成プロンプト", { exact: true })
    .fill("restored manual prompt");
  await accordion(page, "ネガティブプロンプト");
  await page
    .getByLabel("完成ネガティブプロンプト", { exact: true })
    .fill("restored manual negative");
  await setStatus(page, "再生成");
  await page.getByRole("button", { name: "顔", exact: true }).click();
  await page.getByLabel("修正メモ", { exact: true }).fill("顔の輪郭を調整");
  await tab(page, "設定");
  await page
    .getByLabel("状態を変更したら次のページへ進む", { exact: true })
    .uncheck();
  await saved(page);
  const backup = await downloadBackup(page);
  expect(backup.data.works).toHaveLength(1);
  expect(backup.data.works[0].pages).toHaveLength(2);
  expect(backup.data.characters[0].name).toBe("復元キャラ");
  expect(backup.data.works[0].scenes[0].background).toBe("library");
  expect(backup.data.works[0].pages[0].selections[0].weight).toBe(1.4);
  expect(
    backup.data.dictionary.find((entry) => entry.name === "こちらを見る"),
  ).toMatchObject({ favorite: true, uses: 1 });
  expect(backup.data.settings.autoAdvance).toBe(false);

  const pasted = await accordion(page, "JSON を貼り付けて復元");
  await page
    .getByLabel("復元するバックアップ JSON", { exact: true })
    .fill('{"schemaVersion":1,"works":"broken"}');
  await page
    .getByRole("button", { name: "JSON の内容を確認", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "バックアップを読み込めませんでした",
  );
  await expect(
    page.getByRole("region", { name: "復元内容の確認" }),
  ).toHaveCount(0);
  const afterInvalid = await downloadBackup(page);
  expect(afterInvalid.data).toEqual(backup.data);
  await pasted.locator("summary").click();

  await tab(page, "作品");
  const workCard = page
    .locator("article")
    .filter({
      has: page.getByRole("button", { name: "バックアップ作品", exact: true }),
    });
  await deleteConfirmed(workCard, "作品を削除");
  await tab(page, "設定");
  await expect(
    page.getByRole("region", { name: "データ保存状態" }),
  ).toContainText("0 作品 / 0 ページ");
  await page
    .getByLabel("復元する JSON ファイル", { exact: true })
    .setInputFiles(backup.path);
  await expect(
    page.getByRole("region", { name: "復元内容の確認" }),
  ).toContainText("1 作品 / 2 ページ");
  await page
    .getByRole("button", { name: "全データを置き換えて復元", exact: true })
    .click();
  await expect(
    page.getByText("全データを復元しました", { exact: true }),
  ).toBeVisible();
  await saved(page);
  const restored = await downloadBackup(page);
  expect(restored.data).toEqual(backup.data);
  // The alternate paste workflow can validate and cancel without mutating data.
  await accordion(page, "JSON を貼り付けて復元");
  await page
    .getByLabel("復元するバックアップ JSON", { exact: true })
    .fill(JSON.stringify(backup.data));
  await page
    .getByRole("button", { name: "JSON の内容を確認", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "復元内容の確認" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "復元をキャンセル", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "復元内容の確認" }),
  ).toHaveCount(0);
  await fitsScreen(page);

  await page.reload();
  await page
    .getByRole("button", { name: "バックアップ作品", exact: true })
    .click();
  await openPage(page, "ページ 1");
  await expect(page.getByLabel("完成プロンプト", { exact: true })).toHaveValue(
    "restored manual prompt",
  );
  await accordion(page, "ネガティブプロンプト");
  await expect(
    page.getByLabel("完成ネガティブプロンプト", { exact: true }),
  ).toHaveValue("restored manual negative");
  await expect(page.getByLabel("修正メモ", { exact: true })).toHaveValue(
    "顔の輪郭を調整",
  );
  await expect(
    page.getByRole("button", { name: "顔", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await fitsScreen(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await fitsScreen(page);
  await expect(page.locator(".sidebar")).toBeVisible();
  await tab(page, "辞書");
  await page.getByRole("button", { name: "最近使用", exact: true }).click();
  await expect(page.locator(".dictionary-list article")).toContainText(
    "こちらを見る",
  );
  await expect(
    page.getByRole("button", {
      name: "こちらを見るのお気に入り解除",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await tab(page, "設定");
  await expect(
    page.getByLabel("状態を変更したら次のページへ進む", { exact: true }),
  ).not.toBeChecked();
});
