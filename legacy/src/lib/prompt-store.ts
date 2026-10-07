import { useCallback, useEffect, useMemo, useState } from "react";
import { categories as baseCategories, type PromptCategory, type PromptItem } from "@/data/prompts";

const STORAGE_KEY = "prompt-builder-store-v1";

type StoredData = {
  customCategories: { id: string; ja: string; emoji: string }[];
  customItems: { categoryId: string; item: PromptItem }[];
  images: Record<string, string>;
  /** 既存カテゴリも含めた編集内容 */
  categoryEdits: Record<string, { ja?: string; emoji?: string }>;
  /** 既存カテゴリも含めた削除 */
  deletedCategories: string[];
  itemEdits: Record<string, { ja?: string; en?: string }>;
  deletedItems: string[];
  /** カテゴリの並び順（id の配列） */
  categoryOrder: string[];
};

const empty: StoredData = {
  customCategories: [],
  customItems: [],
  images: {},
  categoryEdits: {},
  deletedCategories: [],
  itemEdits: {},
  deletedItems: [],
  categoryOrder: [],
};

function load(): StoredData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<StoredData>;
    return {
      customCategories: parsed.customCategories ?? [],
      customItems: parsed.customItems ?? [],
      images: parsed.images ?? {},
      categoryEdits: parsed.categoryEdits ?? {},
      deletedCategories: parsed.deletedCategories ?? [],
      itemEdits: parsed.itemEdits ?? {},
      deletedItems: parsed.deletedItems ?? [],
      categoryOrder: parsed.categoryOrder ?? [],
    };
  } catch {
    return empty;
  }
}

/** 画像をクライアント側で縮小・圧縮して Data URL にする */
export async function fileToCompressedDataUrl(file: File, maxSize = 512): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("decode failed"));
    image.src = dataUrl;
  });

  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.7);
}

export function usePromptStore() {
  const [data, setData] = useState<StoredData>(empty);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setData(load());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: StoredData) => {
    setData(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      throw new Error("保存できませんでした（保存容量が不足している可能性があります）");
    }
  }, []);

  const categories = useMemo<PromptCategory[]>(() => {
    const all: PromptCategory[] = [
      ...baseCategories.map((c) => ({ ...c, items: [...c.items] })),
      ...data.customCategories.map((c) => ({ ...c, items: [] as PromptItem[] })),
    ];
    for (const { categoryId, item } of data.customItems) {
      const target = all.find((c) => c.id === categoryId);
      if (target) target.items.push(item);
    }

    const visible = all
      .filter((c) => !data.deletedCategories.includes(c.id))
      .map((c) => {
        const edit = data.categoryEdits[c.id];
        return {
          ...c,
          ja: edit?.ja ?? c.ja,
          emoji: edit?.emoji ?? c.emoji,
          items: c.items
            .filter((i) => !data.deletedItems.includes(i.id))
            .map((i) => {
              const ie = data.itemEdits[i.id];
              const image = data.images[i.id];
              return {
                ...i,
                ja: ie?.ja ?? i.ja,
                en: ie?.en ?? i.en,
                ...(image ? { image } : {}),
              };
            }),
        };
      });

    if (data.categoryOrder.length === 0) return visible;
    const rank = new Map(data.categoryOrder.map((id, i) => [id, i]));
    return [...visible].sort(
      (a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [data]);

  const addCategory = useCallback(
    (ja: string, emoji: string) => {
      const id = `cat-${Date.now()}`;
      persist({
        ...data,
        customCategories: [...data.customCategories, { id, ja, emoji: emoji || "🏷️" }],
        categoryOrder: data.categoryOrder.length ? [...data.categoryOrder, id] : [],
      });
      return id;
    },
    [data, persist],
  );

  const updateCategory = useCallback(
    (id: string, ja: string, emoji: string) => {
      persist({
        ...data,
        categoryEdits: { ...data.categoryEdits, [id]: { ja, emoji: emoji || "🏷️" } },
      });
    },
    [data, persist],
  );

  const deleteCategory = useCallback(
    (id: string) => {
      const itemIds = categories.find((c) => c.id === id)?.items.map((i) => i.id) ?? [];
      const images = { ...data.images };
      for (const iid of itemIds) delete images[iid];
      persist({
        ...data,
        images,
        deletedCategories: [...data.deletedCategories, id],
        deletedItems: [...new Set([...data.deletedItems, ...itemIds])],
        categoryOrder: data.categoryOrder.filter((cid) => cid !== id),
      });
      return itemIds;
    },
    [categories, data, persist],
  );

  const reorderCategories = useCallback(
    (ids: string[]) => {
      persist({ ...data, categoryOrder: ids });
    },
    [data, persist],
  );

  const addItem = useCallback(
    (categoryId: string, ja: string, en: string, image?: string) => {
      const id = `item-${Date.now()}`;
      const next: StoredData = {
        ...data,
        customItems: [...data.customItems, { categoryId, item: { id, ja, en } }],
      };
      if (image) next.images = { ...next.images, [id]: image };
      persist(next);
      return id;
    },
    [data, persist],
  );

  const updateItem = useCallback(
    (id: string, ja: string, en: string, image?: string) => {
      const images = { ...data.images };
      if (image) images[id] = image;
      else delete images[id];
      persist({ ...data, images, itemEdits: { ...data.itemEdits, [id]: { ja, en } } });
    },
    [data, persist],
  );

  const deleteItem = useCallback(
    (id: string) => {
      const images = { ...data.images };
      delete images[id];
      persist({ ...data, images, deletedItems: [...new Set([...data.deletedItems, id])] });
    },
    [data, persist],
  );

  const setImage = useCallback(
    (itemId: string, image: string) => {
      persist({ ...data, images: { ...data.images, [itemId]: image } });
    },
    [data, persist],
  );

  const removeImage = useCallback(
    (itemId: string) => {
      const images = { ...data.images };
      delete images[itemId];
      persist({ ...data, images });
    },
    [data, persist],
  );

  return {
    categories,
    hydrated,
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    addItem,
    updateItem,
    deleteItem,
    setImage,
    removeImage,
  };
}
