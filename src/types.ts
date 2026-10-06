export const STATUSES = [
  "未作成",
  "プロンプト完成",
  "生成済み",
  "再生成",
  "採用",
  "完成",
] as const;
export type Status = (typeof STATUSES)[number];
export const REASONS = [
  "手",
  "表情",
  "顔",
  "構図",
  "背景",
  "服装",
  "キャラクター崩れ",
  "画質",
  "その他",
];
export interface Selection {
  promptId: string;
  text: string;
  weight: number;
}
export interface Page {
  id: string;
  number: number;
  title: string;
  memo: string;
  sceneId: string;
  prompt: string;
  negative: string;
  revisionMemo: string;
  status: Status;
  reasons: string[];
  background: string;
  outfit: string;
  style: string;
  selections: Selection[];
  promptOverride: string | null;
  negativeOverride: string | null;
  previewAssetId?: string;
  createdAt: string;
  updatedAt: string;
}
export interface Scene {
  id: string;
  name: string;
  background: string;
  outfit: string;
  time: string;
  lighting: string;
  prompt: string;
  negative: string;
  memo: string;
}
export interface Work {
  id: string;
  name: string;
  characterName: string;
  characterId: string;
  memo: string;
  commonPrompt: string;
  commonNegative: string;
  createdAt: string;
  updatedAt: string;
  pages: Page[];
  scenes: Scene[];
}
export interface PromptEntry {
  id: string;
  name: string;
  text: string;
  categoryId: string;
  favorite: boolean;
  uses: number;
  lastUsedAt: string | null;
  memo: string;
}
export interface Category {
  id: string;
  name: string;
}
export interface Character {
  id: string;
  name: string;
  prompt: string;
  negative: string;
  memo: string;
}
export interface Template {
  id: string;
  name: string;
  prompt: string;
  negative: string;
  memo: string;
}
export interface Preset {
  id: string;
  name: string;
  prompt: string;
  negative: string;
  memo: string;
}
export interface AppData {
  schemaVersion: 1;
  works: Work[];
  dictionary: PromptEntry[];
  categories: Category[];
  characters: Character[];
  templates: Template[];
  presets: Preset[];
  settings: {
    activeWorkId: string;
    activePageId: string;
    autoAdvance: boolean;
  };
}
export type Tab =
  "works" | "production" | "dictionary" | "presets" | "settings";
