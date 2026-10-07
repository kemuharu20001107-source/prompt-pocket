import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Pencil,
  Search,
  Settings,
  Trash2,
  X,
  ImageIcon,
} from "lucide-react";
import { type PromptItem } from "@/data/prompts";
import { AdminSheet } from "@/components/AdminSheet";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ItemEditSheet } from "@/components/ItemEditSheet";
import { SortableTags, type TagChip } from "@/components/SortableTags";
import { fileToCompressedDataUrl, usePromptStore } from "@/lib/prompt-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "プロンプトビルダー | 日本語で選ぶ画像生成プロンプト" },
      {
        name: "description",
        content:
          "日本語で探してタップするだけ。人数・服装・表情・カメラ・背景などのタグから画像生成用の英語プロンプトを組み立て、並べ替えてそのままコピーできます。",
      },
      { property: "og:title", content: "プロンプトビルダー | 日本語で選ぶ画像生成プロンプト" },
      {
        property: "og:description",
        content: "日本語ラベルをタップして英語プロンプトを自動作成。スマホでかんたんに使えます。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function splitTokens(text: string) {
  return text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function Index() {
  const {
    categories,
    addCategory,
    addItem,
    updateCategory,
    deleteCategory,
    reorderCategories,
    updateItem,
    deleteItem,
    setImage,
    removeImage,
  } = usePromptStore();
  const [query, setQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  /** 選択タグ由来（順番付き） */
  const [selected, setSelected] = useState<string[]>([]);
  /** 自由入力部分だけを保持 */
  const [freeText, setFreeText] = useState("");
  const [open, setOpen] = useState(true);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [editingItem, setEditingItem] = useState<PromptItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<PromptItem | null>(null);
  const imageTargetRef = useRef<string | null>(null);
  const cardFileRef = useRef<HTMLInputElement>(null);

  const activeCategory = categories.find((c) => c.id === activeCategoryId)?.id ?? categories[0]?.id;
  const setActiveCategory = setActiveCategoryId;

  const searching = query.trim().length > 0;

  const allItems = useMemo(() => categories.flatMap((c) => c.items), [categories]);
  const itemById = useMemo(() => new Map(allItems.map((i) => [i.id, i])), [allItems]);

  /** 選択タグ（存在するものだけ）＋自由入力を結合した最終文字列 */
  const tagTokens = useMemo(
    () => selected.map((id) => itemById.get(id)?.en).filter((en): en is string => Boolean(en)),
    [selected, itemById],
  );
  const text = useMemo(
    () => [...tagTokens, ...splitTokens(freeText)].join(", "),
    [tagTokens, freeText],
  );

  const chips = useMemo<TagChip[]>(
    () =>
      selected
        .map((id) => itemById.get(id))
        .filter((i): i is PromptItem => Boolean(i))
        .map((i) => ({ id: i.id, label: i.ja, sub: i.en })),
    [selected, itemById],
  );

  /** 直接編集：タグ由来のトークンを除いた残りを自由入力として保持 */
  const onTextChange = (next: string) => {
    const tags = [...tagTokens];
    const rest: string[] = [];
    for (const token of splitTokens(next)) {
      const at = tags.indexOf(token);
      if (at >= 0) tags.splice(at, 1);
      else rest.push(token);
    }
    // 消されたタグは選択からも外す
    if (tags.length > 0) {
      const remaining = new Set(splitTokens(next));
      setSelected((prev) =>
        prev.filter((id) => {
          const en = itemById.get(id)?.en;
          return en ? remaining.has(en) : false;
        }),
      );
    }
    setFreeText(rest.join(", "));
  };

  const visibleItems = useMemo<{ categoryJa: string; items: PromptItem[] }[]>(() => {
    if (searching) {
      const q = query.trim().toLowerCase();
      return categories
        .map((c) => ({
          categoryJa: c.ja,
          items: c.items.filter(
            (i) => i.ja.toLowerCase().includes(q) || i.en.toLowerCase().includes(q),
          ),
        }))
        .filter((g) => g.items.length > 0);
    }
    const c = categories.find((x) => x.id === activeCategory);
    return c ? [{ categoryJa: c.ja, items: c.items }] : [];
  }, [query, searching, activeCategory, categories]);

  const toggle = (item: PromptItem) => {
    setSelected((prev) =>
      prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id],
    );
  };

  const clearAll = () => {
    setSelected([]);
    setFreeText("");
  };

  const copy = async () => {
    if (!text.trim()) {
      toast("プロンプトがまだ空です");
      return;
    }
    try {
      await navigator.clipboard.writeText(text.trim());
      toast.success("コピーしました");
    } catch {
      toast.error("コピーできませんでした");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-80">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 px-4 pt-5 pb-3 backdrop-blur">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight">プロンプトビルダー</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              日本語で探してタップ、英語プロンプトが出来上がります。
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setAdminMode(true);
              setAdminOpen(true);
            }}
            aria-label="管理パネルを開く"
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-full border border-border active:bg-muted",
              adminMode ? "bg-accent text-accent-foreground" : "bg-card text-muted-foreground",
            )}
          >
            <Settings className="size-5" />
          </button>
        </div>
        {adminMode && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground">
            管理モード中：カードから編集・削除・画像追加ができます
            <button
              type="button"
              onClick={() => setAdminMode(false)}
              className="rounded-full bg-card px-3 py-1 text-xs font-semibold text-foreground"
            >
              終了
            </button>
          </div>
        )}

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            inputMode="search"
            placeholder="日本語 / 英語で検索（例: 笑顔、smile）"
            className="h-14 w-full rounded-2xl border border-input bg-card pr-12 pl-12 text-base shadow-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/30"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="検索をクリア"
              className="absolute top-1/2 right-2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
            >
              <X className="size-5" />
            </button>
          )}
        </div>
      </header>

      {!searching && (
        <nav
          aria-label="カテゴリ"
          className="-mx-4 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex w-max gap-2 px-4">
            {categories.map((c) => {
              const active = c.id === activeCategory;
              const count = c.items.filter((i) => selected.includes(i.id)).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveCategory(c.id)}
                  className={cn(
                    "flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-card text-secondary-foreground",
                  )}
                >
                  <span aria-hidden>{c.emoji}</span>
                  {c.ja}
                  {count > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-xs font-semibold",
                        active ? "bg-primary-foreground/25" : "bg-accent text-accent-foreground",
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <main className="px-4 pt-2">
        {searching && visibleItems.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            「{query}」に一致するプロンプトはありません。
          </p>
        )}

        {visibleItems.map((group) => (
          <section key={group.categoryJa} className="mb-6">
            {searching && (
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">
                {group.categoryJa}
              </h2>
            )}
            <ul className="grid grid-cols-2 gap-3">
              {group.items.map((item) => {
                const isSelected = selected.includes(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggle(item)}
                      className={cn(
                        "flex w-full flex-col gap-2 rounded-2xl border p-3 text-left transition-colors",
                        isSelected
                          ? "border-primary bg-accent shadow-sm ring-2 ring-primary/40"
                          : "border-border bg-card shadow-sm",
                      )}
                    >
                      <div
                        className={cn(
                          "relative flex aspect-4/3 items-center justify-center overflow-hidden rounded-xl",
                          isSelected ? "bg-primary/10" : "bg-muted",
                        )}
                      >
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={`${item.ja}の生成例`}
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="size-7 text-muted-foreground/60" aria-hidden />
                        )}
                        {isSelected && (
                          <span className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-4" />
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-[15px] leading-tight font-semibold">{item.ja}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.en}</p>
                      </div>
                    </button>
                    {adminMode && (
                      <div className="mt-1 space-y-1">
                        <button
                          type="button"
                          onClick={() => {
                            imageTargetRef.current = item.id;
                            cardFileRef.current?.click();
                          }}
                          className="h-10 w-full rounded-xl border border-border bg-card text-xs font-semibold active:bg-muted"
                        >
                          画像を追加/変更
                        </button>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingItem(item)}
                            aria-label={`${item.ja}を編集`}
                            className="flex h-10 flex-1 items-center justify-center gap-1 rounded-xl border border-border bg-card text-xs font-semibold active:bg-muted"
                          >
                            <Pencil className="size-3.5" />
                            編集
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingItem(item)}
                            aria-label={`${item.ja}を削除`}
                            className="flex h-10 flex-1 items-center justify-center gap-1 rounded-xl border border-border bg-card text-xs font-semibold text-muted-foreground active:bg-muted"
                          >
                            <Trash2 className="size-3.5" />
                            削除
                          </button>
                        </div>
                        {item.image && (
                          <button
                            type="button"
                            onClick={() => {
                              removeImage(item.id);
                              toast.success("画像を削除しました");
                            }}
                            className="h-9 w-full rounded-xl text-xs font-semibold text-muted-foreground active:bg-muted"
                          >
                            画像だけ削除
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {group.items.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                まだプロンプトがありません。右上の管理ボタンから追加できます。
              </p>
            )}
          </section>
        ))}
      </main>

      <input
        ref={cardFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          const id = imageTargetRef.current;
          e.target.value = "";
          if (!file || !id) return;
          try {
            setImage(id, await fileToCompressedDataUrl(file));
            toast.success("参考画像を保存しました");
          } catch {
            toast.error("画像を保存できませんでした");
          }
        }}
      />

      <AdminSheet
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        categories={categories}
        onAddCategory={(ja, emoji) => {
          const id = addCategory(ja, emoji);
          setActiveCategory(id);
          setQuery("");
          return id;
        }}
        onAddItem={(catId, ja, en, image) => {
          addItem(catId, ja, en, image);
          setActiveCategory(catId);
          setQuery("");
        }}
        onUpdateCategory={updateCategory}
        onDeleteCategory={(id) => {
          const removed = categories.find((c) => c.id === id)?.items.map((i) => i.id) ?? [];
          deleteCategory(id);
          setSelected((prev) => prev.filter((sid) => !removed.includes(sid)));
          if (activeCategoryId === id) setActiveCategoryId(null);
        }}
        onReorderCategories={reorderCategories}
      />

      <ItemEditSheet
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSave={(id, ja, en, image) => updateItem(id, ja, en, image)}
      />

      <ConfirmDialog
        open={deletingItem !== null}
        title={`「${deletingItem?.ja ?? ""}」を削除しますか？`}
        description="このプロンプトを一覧から削除します。元に戻せません。"
        confirmLabel="プロンプトを削除"
        onCancel={() => setDeletingItem(null)}
        onConfirm={() => {
          if (deletingItem) {
            deleteItem(deletingItem.id);
            setSelected((prev) => prev.filter((id) => id !== deletingItem.id));
          }
          setDeletingItem(null);
          toast.success("プロンプトを削除しました");
        }}
      />

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.15)] backdrop-blur">
        <div className="px-4 pt-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex h-11 flex-1 items-center gap-2 rounded-xl px-1 text-left text-sm font-semibold active:bg-muted"
            >
              {open ? <ChevronDown className="size-5" /> : <ChevronUp className="size-5" />}
              完成プロンプト
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                {selected.length}個選択中
              </span>
            </button>
            <button
              type="button"
              onClick={clearAll}
              aria-label="すべて解除"
              className="flex size-11 items-center justify-center rounded-xl border border-border text-muted-foreground active:bg-muted"
            >
              <Trash2 className="size-5" />
            </button>
          </div>

          {open && (
            <>
              <SortableTags
                chips={chips}
                onReorder={setSelected}
                onRemove={(id) => setSelected((prev) => prev.filter((x) => x !== id))}
              />
              <textarea
                value={text}
                onChange={(e) => onTextChange(e.target.value)}
                rows={4}
                placeholder="タグをタップすると自動で追加されます。(masterpiece:1.2) のように直接編集もできます。"
                className="mt-2 w-full resize-none rounded-2xl border border-input bg-background p-3 font-mono text-sm leading-relaxed outline-none placeholder:font-sans placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/30"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                タグはドラッグで並べ替えできます。手入力した内容はそのまま残ります。
              </p>
            </>
          )}

          <button
            type="button"
            onClick={copy}
            className="mt-2 mb-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-sm active:opacity-90"
          >
            <Copy className="size-5" />
            プロンプトをコピー
          </button>
        </div>
      </div>
    </div>
  );
}
