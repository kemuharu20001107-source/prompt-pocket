export type PromptItem = {
  id: string;
  ja: string;
  en: string;
  /** 将来的に生成例画像を紐づける（Ver.1 は未設定でプレースホルダー表示） */
  image?: string;
};

export type PromptCategory = {
  id: string;
  ja: string;
  emoji: string;
  items: PromptItem[];
};

export const categories: PromptCategory[] = [
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

export const allItems: PromptItem[] = categories.flatMap((c) => c.items);
