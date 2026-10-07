import { categories as baseCategories } from "@/data/prompts";
import {
  DEFAULT_SETTINGS,
  OTHER_CATEGORY_ID,
  SCHEMA_VERSION,
  type AppData,
  type Category,
  type DictItem,
} from "./schema";

const mk = (id: string, label: string, prompt: string, categoryId: string, now: number, image?: string): DictItem => ({
  id,
  label,
  prompt,
  categoryId,
  favorite: false,
  note: "",
  usageCount: 0,
  lastUsedAt: null,
  createdAt: now,
  ...(image ? { image } : {}),
});

/** 初回の新規ユーザーだけに追加する少量サンプル（削除可） */
const EXTRA: { id: string; name: string; emoji: string; items: [string, string][] }[] = [
  { id: "hairstyle", name: "髪型", emoji: "💇", items: [["ポニーテール", "ponytail"], ["ボブ", "bob cut"], ["三つ編み", "braid"]] },
  { id: "haircolor", name: "髪色", emoji: "🎨", items: [["金髪", "blonde hair"], ["銀髪", "silver hair"], ["ピンク髪", "pink hair"]] },
  { id: "gaze", name: "視線", emoji: "👀", items: [["カメラ目線", "looking at viewer"], ["横を見る", "looking to the side"], ["上目遣い", "looking up"]] },
  { id: "quality", name: "品質", emoji: "💎", items: [["最高品質", "masterpiece, best quality"], ["高精細", "highly detailed"], ["8K", "8k wallpaper"]] },
  { id: "style", name: "画風", emoji: "🖌️", items: [["アニメ風", "anime style"], ["水彩", "watercolor"], ["写実的", "photorealistic"]] },
  { id: "lighting", name: "ライティング", emoji: "💡", items: [["柔らかい光", "soft lighting"], ["逆光", "backlighting"], ["シネマティック", "cinematic lighting"]] },
];

function empty(categories: Category[], items: DictItem[]): AppData {
  return { schemaVersion: SCHEMA_VERSION, categories, items, presets: [], history: [], settings: { ...DEFAULT_SETTINGS } };
}

export function buildSeed(withExtras: boolean, now = Date.now()): AppData {
  const categories: Category[] = baseCategories.map((c) => ({ id: c.id, name: c.ja, emoji: c.emoji }));
  const items: DictItem[] = baseCategories.flatMap((c) => c.items.map((i) => mk(i.id, i.ja, i.en, c.id, now)));
  if (withExtras) {
    for (const c of EXTRA) {
      categories.push({ id: c.id, name: c.name, emoji: c.emoji });
      c.items.forEach(([l, p], n) => items.push(mk(`${c.id}-${n + 1}`, l, p, c.id, now)));
    }
  }
  return empty(categories, items);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rec = (x: unknown): any =>
  x && typeof x === "object" && !Array.isArray(x) ? x : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): x is string => typeof x === "string" && x.length > 0;

/** 旧 prompt-builder-store-v1 の差分を baseCategories に適用して新形式へ */
export function migrateLegacy(raw: unknown, now = Date.now()): AppData {
  const o = rec(raw);
  const catEdits = rec(o.categoryEdits);
  const itemEdits = rec(o.itemEdits);
  const images = rec(o.images);
  const deletedCats = new Set(arr(o.deletedCategories).filter(str));
  const deletedItems = new Set(arr(o.deletedItems).filter(str));
  const order = arr(o.categoryOrder).filter(str);

  const cats: Category[] = baseCategories.map((c) => ({ id: c.id, name: c.ja, emoji: c.emoji }));
  for (const c of arr(o.customCategories)) {
    const r = rec(c);
    if (str(r.id) && str(r.ja)) cats.push({ id: r.id, name: r.ja, emoji: typeof r.emoji === "string" ? r.emoji : "🏷️" });
  }
  const items: DictItem[] = baseCategories.flatMap((c) => c.items.map((i) => mk(i.id, i.ja, i.en, c.id, now)));
  for (const ci of arr(o.customItems)) {
    const r = rec(ci);
    const it = rec(r.item);
    if (str(r.categoryId) && str(it.id) && str(it.ja) && str(it.en)) items.push(mk(it.id, it.ja, it.en, r.categoryId, now));
  }

  const seenC = new Set<string>();
  let categories = cats
    .filter((c) => !deletedCats.has(c.id) && !seenC.has(c.id) && (seenC.add(c.id), true))
    .map((c) => {
      const e = rec(catEdits[c.id]);
      return { ...c, name: str(e.ja) ? e.ja : c.name, emoji: typeof e.emoji === "string" ? e.emoji : c.emoji };
    });
  if (order.length) {
    const rank = new Map(order.map((id, i) => [id, i]));
    categories = [...categories].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
  }
  const catIds = new Set(categories.map((c) => c.id));
  const seenI = new Set<string>();
  const outItems = items
    .filter((i) => !deletedItems.has(i.id) && catIds.has(i.categoryId) && !seenI.has(i.id) && (seenI.add(i.id), true))
    .map((i) => {
      const e = rec(itemEdits[i.id]);
      const img = images[i.id];
      return {
        ...i,
        label: str(e.ja) ? e.ja : i.label,
        prompt: str(e.en) ? e.en : i.prompt,
        ...(typeof img === "string" && img.startsWith("data:image/") ? { image: img } : {}),
      };
    });
  if (categories.length === 0) categories = [{ id: OTHER_CATEGORY_ID, name: "その他", emoji: "📦" }];
  return empty(categories, outItems);
}
