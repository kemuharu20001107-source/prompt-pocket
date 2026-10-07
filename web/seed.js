/** Existing dictionary IDs are retained so legacy customizations remain valid. */
export const BASE_CATEGORIES = [
  {
    id: "count",
    ja: "人数",
    emoji: "👥",
    items: [
      { id: "count-solo", ja: "1人", en: "1girl, solo" },
      { id: "count-solo-boy", ja: "男性1人", en: "1boy, solo" },
      { id: "count-two", ja: "2人", en: "2girls" },
      { id: "count-couple", ja: "男女2人", en: "1girl, 1boy, couple" },
      { id: "count-group", ja: "複数人（集団）", en: "multiple girls, group" },
    ],
  },
  {
    id: "character",
    ja: "キャラクター特徴",
    emoji: "✨",
    items: [
      { id: "char-long-hair", ja: "ロングヘア", en: "long hair" },
      { id: "char-short-hair", ja: "ショートヘア", en: "short hair" },
      { id: "char-twintails", ja: "ツインテール", en: "twintails" },
      { id: "char-black-hair", ja: "黒髪", en: "black hair" },
      { id: "char-blue-eyes", ja: "青い目", en: "blue eyes" },
      { id: "char-freckles", ja: "そばかす", en: "freckles" },
    ],
  },
  {
    id: "clothes",
    ja: "服装",
    emoji: "👗",
    items: [
      { id: "cloth-uniform", ja: "制服", en: "school uniform" },
      { id: "cloth-dress", ja: "ワンピース", en: "white dress" },
      { id: "cloth-suit", ja: "スーツ", en: "business suit" },
      { id: "cloth-hoodie", ja: "パーカー", en: "oversized hoodie" },
      { id: "cloth-kimono", ja: "着物", en: "kimono" },
      { id: "cloth-armor", ja: "鎧", en: "ornate armor" },
    ],
  },
  {
    id: "expression",
    ja: "表情",
    emoji: "🙂",
    items: [
      { id: "exp-smile", ja: "笑顔", en: "smile" },
      { id: "exp-laugh", ja: "大笑い", en: "open mouth, laughing" },
      { id: "exp-serious", ja: "真剣な表情", en: "serious expression" },
      { id: "exp-blush", ja: "照れ", en: "blush, embarrassed" },
      { id: "exp-cry", ja: "涙", en: "tears, crying" },
    ],
  },
  {
    id: "pose",
    ja: "ポーズ",
    emoji: "🧍",
    items: [
      { id: "pose-standing", ja: "立ち姿", en: "standing" },
      { id: "pose-sitting", ja: "座っている", en: "sitting" },
      { id: "pose-lying", ja: "寝そべる", en: "lying on back" },
      { id: "pose-arms-crossed", ja: "腕組み", en: "crossed arms" },
      { id: "pose-looking-back", ja: "振り返り", en: "looking back" },
    ],
  },
  {
    id: "action",
    ja: "行動",
    emoji: "🏃",
    items: [
      { id: "act-walking", ja: "歩いている", en: "walking" },
      { id: "act-running", ja: "走っている", en: "running" },
      { id: "act-reading", ja: "読書", en: "reading a book" },
      { id: "act-drinking", ja: "コーヒーを飲む", en: "drinking coffee" },
      { id: "act-dancing", ja: "踊っている", en: "dancing" },
    ],
  },
  {
    id: "camera",
    ja: "カメラ",
    emoji: "📷",
    items: [
      { id: "cam-portrait", ja: "上半身（バストアップ）", en: "upper body" },
      { id: "cam-fullbody", ja: "全身", en: "full body" },
      { id: "cam-closeup", ja: "顔のクローズアップ", en: "close-up portrait" },
      { id: "cam-low-angle", ja: "ローアングル", en: "from below" },
      { id: "cam-bokeh", ja: "背景ぼかし", en: "depth of field, bokeh" },
      { id: "cam-wide", ja: "広角", en: "wide angle lens" },
    ],
  },
  {
    id: "background",
    ja: "背景",
    emoji: "🌆",
    items: [
      { id: "bg-city", ja: "夜の街", en: "night city street, neon lights" },
      { id: "bg-cafe", ja: "カフェ", en: "cozy cafe interior" },
      { id: "bg-beach", ja: "海辺", en: "beach, ocean, blue sky" },
      { id: "bg-forest", ja: "森", en: "lush forest" },
      { id: "bg-simple", ja: "シンプルな白背景", en: "simple white background" },
      { id: "bg-sunset", ja: "夕焼け", en: "sunset, golden hour lighting" },
    ],
  },
];

export const SCHEMA_VERSION = 1;
export const OTHER_CATEGORY_ID = "other";
export const DEFAULT_SETTINGS = Object.freeze({ showImages: false, sort: "default" });
const EXTRA = [
  { id: "hairstyle", name: "髪型", emoji: "💇", items: [["ポニーテール", "ponytail"], ["ボブ", "bob cut"], ["三つ編み", "braid"]] },
  { id: "haircolor", name: "髪色", emoji: "🎨", items: [["金髪", "blonde hair"], ["銀髪", "silver hair"], ["ピンク髪", "pink hair"]] },
  { id: "gaze", name: "視線", emoji: "👀", items: [["カメラ目線", "looking at viewer"], ["横を見る", "looking to the side"], ["上目遣い", "looking up"]] },
  { id: "quality", name: "品質", emoji: "💎", items: [["最高品質", "masterpiece, best quality"], ["高精細", "highly detailed"], ["8K", "8k wallpaper"]] },
  { id: "style", name: "画風", emoji: "🖌️", items: [["アニメ風", "anime style"], ["水彩", "watercolor"], ["写実的", "photorealistic"]] },
  { id: "lighting", name: "ライティング", emoji: "💡", items: [["柔らかい光", "soft lighting"], ["逆光", "backlighting"], ["シネマティック", "cinematic lighting"]] },
  { id: "face", name: "顔", emoji: "🙂", items: [] },
  { id: "eyes", name: "目", emoji: "👁️", items: [] },
  { id: "body", name: "体型", emoji: "🧍", items: [] },
  { id: "hands", name: "手", emoji: "✋", items: [] },
  { id: "composition", name: "構図", emoji: "🖼️", items: [] },
  { id: OTHER_CATEGORY_ID, name: "その他", emoji: "📦", items: [] },
];

export function makeItem(id, label, prompt, categoryId, now, image) {
  return { id, label, prompt, categoryId, favorite: false, note: "", usageCount: 0,
    lastUsedAt: null, createdAt: now, ...(image ? { image } : {}) };
}
function empty(categories, items) {
  return { schemaVersion: SCHEMA_VERSION, categories, items, presets: [], history: [], settings: { ...DEFAULT_SETTINGS } };
}
export function buildSeed(withExtras = true, now = Date.now()) {
  const categories = BASE_CATEGORIES.map(c => ({ id: c.id, name: c.ja, emoji: c.emoji }));
  const items = BASE_CATEGORIES.flatMap(c => c.items.map(i => makeItem(i.id, i.ja, i.en, c.id, now)));
  if (withExtras) for (const c of EXTRA) {
    categories.push({ id: c.id, name: c.name, emoji: c.emoji });
    c.items.forEach(([label, prompt], n) => items.push(makeItem(c.id + "-" + (n + 1), label, prompt, c.id, now)));
  }
  return empty(categories, items);
}
const object = x => x !== null && typeof x === "object" && !Array.isArray(x);
const nonempty = x => typeof x === "string" && x.trim().length > 0;
const optional = (o, key, check) => !(key in o) || check(o[key]);
const stringList = x => Array.isArray(x) && x.every(nonempty);
const LEGACY_KEYS = ["customCategories", "customItems", "images", "categoryEdits", "deletedCategories", "itemEdits", "deletedItems", "categoryOrder"];
export const isLegacyData = x => object(x) && LEGACY_KEYS.some(key => Object.hasOwn(x, key));

/** Validate old diff data before applying it. Invalid data must never silently become a seed. */
export function validateLegacy(raw) {
  if (!object(raw)) throw new Error("以前の保存データがオブジェクトではありません");
  if (!optional(raw, "customCategories", x => Array.isArray(x) && x.every(c => object(c) && nonempty(c.id) && nonempty(c.ja) && optional(c, "emoji", e => typeof e === "string"))))
    throw new Error("以前のカテゴリの形式が正しくありません");
  if (!optional(raw, "customItems", x => Array.isArray(x) && x.every(c => object(c) && nonempty(c.categoryId) && object(c.item) && nonempty(c.item.id) && nonempty(c.item.ja) && nonempty(c.item.en) && optional(c.item, "image", s => typeof s === "string" && s.startsWith("data:image/")))))
    throw new Error("以前の辞書項目の形式が正しくありません");
  for (const key of ["deletedCategories", "deletedItems", "categoryOrder"])
    if (!optional(raw, key, stringList)) throw new Error("以前の " + key + " の形式が正しくありません");
  if (!optional(raw, "images", x => object(x) && Object.values(x).every(s => typeof s === "string" && (s === "" || s.startsWith("data:image/")))))
    throw new Error("以前の参考画像の形式が正しくありません");
  if (!optional(raw, "categoryEdits", x => object(x) && Object.values(x).every(e => object(e) && optional(e, "ja", nonempty) && optional(e, "emoji", s => typeof s === "string"))))
    throw new Error("以前のカテゴリ編集の形式が正しくありません");
  if (!optional(raw, "itemEdits", x => object(x) && Object.values(x).every(e => object(e) && optional(e, "ja", nonempty) && optional(e, "en", nonempty))))
    throw new Error("以前の辞書編集の形式が正しくありません");
  const customCatIds = (raw.customCategories || []).map(c => c.id);
  const baseCatIds = new Set(BASE_CATEGORIES.map(c => c.id));
  if (new Set(customCatIds).size !== customCatIds.length || customCatIds.some(id => baseCatIds.has(id)))
    throw new Error("以前のカテゴリIDが重複しています");
  const customItemIds = (raw.customItems || []).map(c => c.item.id);
  const baseItemIds = new Set(BASE_CATEGORIES.flatMap(c => c.items.map(i => i.id)));
  if (new Set(customItemIds).size !== customItemIds.length || customItemIds.some(id => baseItemIds.has(id)))
    throw new Error("以前の辞書項目IDが重複しています");
  return raw;
}
export function migrateLegacy(input, now = Date.now()) {
  const raw = validateLegacy(input);
  const deletedCategories = new Set(raw.deletedCategories || []);
  const deletedItems = new Set(raw.deletedItems || []);
  const edits = raw.categoryEdits || {}, itemEdits = raw.itemEdits || {}, images = raw.images || {};
  const allCategories = [
    ...BASE_CATEGORIES.map(c => ({ id: c.id, name: c.ja, emoji: c.emoji })),
    ...(raw.customCategories || []).map(c => ({ id: c.id, name: c.ja, emoji: c.emoji || "🏷️" })),
  ];
  let categories = allCategories.filter(c => !deletedCategories.has(c.id)).map(c => {
    const edit = edits[c.id] || {};
    return { ...c, name: edit.ja ?? c.name, emoji: edit.emoji ?? c.emoji };
  });
  const rank = new Map((raw.categoryOrder || []).map((id, index) => [id, index]));
  categories.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
  const known = new Set(allCategories.map(c => c.id));
  for (const c of raw.customItems || []) if (!known.has(c.categoryId))
    throw new Error("以前の辞書項目のカテゴリが存在しません（" + c.categoryId + "）");
  const active = new Set(categories.map(c => c.id));
  const items = [
    ...BASE_CATEGORIES.flatMap(c => c.items.map(i => makeItem(i.id, i.ja, i.en, c.id, now, i.image))),
    ...(raw.customItems || []).map(c => makeItem(c.item.id, c.item.ja, c.item.en, c.categoryId, now, c.item.image)),
  ].filter(i => !deletedItems.has(i.id) && active.has(i.categoryId)).map(i => {
    const edit = itemEdits[i.id] || {}, image = images[i.id] ?? i.image;
    const next = { ...i, label: edit.ja ?? i.label, prompt: edit.en ?? i.prompt };
    if (image) next.image = image;
    else delete next.image;
    return next;
  });
  if (!categories.length) categories = [{ id: OTHER_CATEGORY_ID, name: "その他", emoji: "📦" }];
  return empty(categories, items);
}
