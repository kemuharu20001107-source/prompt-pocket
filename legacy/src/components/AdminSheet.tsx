import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, ImagePlus, Pencil, Trash2, X } from "lucide-react";
import type { PromptCategory } from "@/data/prompts";
import { fileToCompressedDataUrl } from "@/lib/prompt-store";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  categories: PromptCategory[];
  onAddCategory: (ja: string, emoji: string) => string;
  onAddItem: (categoryId: string, ja: string, en: string, image?: string) => void;
  onUpdateCategory: (id: string, ja: string, emoji: string) => void;
  onDeleteCategory: (id: string) => void;
  onReorderCategories: (ids: string[]) => void;
};

const inputClass =
  "h-13 w-full rounded-2xl border border-input bg-background px-4 text-base outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/30";

function SortableCategoryRow({
  category,
  onEdit,
  onDelete,
}: {
  category: PromptCategory;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex touch-none items-center gap-2 rounded-2xl border bg-card p-2",
        isDragging ? "border-primary shadow-lg" : "border-border",
      )}
    >
      <button
        type="button"
        aria-label={`${category.ja}を並べ替え`}
        className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground active:bg-accent"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-6" />
      </button>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
        <span aria-hidden className="mr-1">
          {category.emoji}
        </span>
        {category.ja}
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          {category.items.length}件
        </span>
      </span>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`${category.ja}を編集`}
        className="flex size-11 items-center justify-center rounded-xl border border-border text-muted-foreground active:bg-muted"
      >
        <Pencil className="size-4" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`${category.ja}を削除`}
        className="flex size-11 items-center justify-center rounded-xl border border-border text-muted-foreground active:bg-muted"
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

export function AdminSheet({
  open,
  onClose,
  categories,
  onAddCategory,
  onAddItem,
  onUpdateCategory,
  onDeleteCategory,
  onReorderCategories,
}: Props) {
  const [tab, setTab] = useState<"category" | "item" | "manage">("category");
  const [catJa, setCatJa] = useState("");
  const [catEmoji, setCatEmoji] = useState("");
  const [targetCat, setTargetCat] = useState(categories[0]?.id ?? "");
  const [itemJa, setItemJa] = useState("");
  const [itemEn, setItemEn] = useState("");
  const [itemImage, setItemImage] = useState<string | undefined>(undefined);
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editJa, setEditJa] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
  const [deleteCat, setDeleteCat] = useState<PromptCategory | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!open) return null;

  const addCategory = () => {
    if (!catJa.trim()) {
      toast.error("カテゴリ名を入力してください");
      return;
    }
    const id = onAddCategory(catJa.trim(), catEmoji.trim());
    setCatJa("");
    setCatEmoji("");
    setTargetCat(id);
    toast.success("カテゴリを追加しました");
  };

  const addItem = () => {
    if (!targetCat) {
      toast.error("追加先カテゴリを選んでください");
      return;
    }
    if (!itemJa.trim() || !itemEn.trim()) {
      toast.error("日本語ラベルと英語プロンプトは必須です");
      return;
    }
    onAddItem(targetCat, itemJa.trim(), itemEn.trim(), itemImage);
    setItemJa("");
    setItemEn("");
    setItemImage(undefined);
    toast.success("プロンプトを追加しました");
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      setItemImage(await fileToCompressedDataUrl(file));
    } catch {
      toast.error("画像を読み込めませんでした");
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = categories.map((c) => c.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorderCategories(arrayMove(ids, from, to));
    toast.success("並び順を保存しました");
  };

  const saveCategoryEdit = () => {
    if (!editingCat) return;
    if (!editJa.trim()) {
      toast.error("カテゴリ名を入力してください");
      return;
    }
    onUpdateCategory(editingCat, editJa.trim(), editEmoji.trim());
    setEditingCat(null);
    toast.success("カテゴリを更新しました");
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40"
      />
      <div className="relative max-h-[88vh] overflow-y-auto rounded-t-3xl bg-card px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">管理パネル</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="flex size-11 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-3 flex gap-1 rounded-2xl bg-muted p-1">
          {(
            [
              ["category", "カテゴリ追加"],
              ["item", "プロンプト追加"],
              ["manage", "カテゴリ管理"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "h-11 flex-1 rounded-xl text-xs font-semibold",
                tab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "category" && (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-semibold">
              カテゴリ名（日本語）
              <input
                value={catJa}
                onChange={(e) => setCatJa(e.target.value)}
                placeholder="例: 画風"
                className={cn(inputClass, "mt-1.5 font-normal")}
              />
            </label>
            <label className="block text-sm font-semibold">
              絵文字（任意）
              <input
                value={catEmoji}
                onChange={(e) => setCatEmoji(e.target.value)}
                placeholder="例: 🎨"
                className={cn(inputClass, "mt-1.5 font-normal")}
              />
            </label>
            <button
              type="button"
              onClick={addCategory}
              className="h-14 w-full rounded-2xl bg-primary text-base font-bold text-primary-foreground active:opacity-90"
            >
              カテゴリを追加
            </button>
          </div>
        )}

        {tab === "item" && (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-semibold">
              追加先カテゴリ
              <select
                value={targetCat}
                onChange={(e) => setTargetCat(e.target.value)}
                className={cn(inputClass, "mt-1.5 font-normal")}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.ja}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              日本語ラベル（必須）
              <input
                value={itemJa}
                onChange={(e) => setItemJa(e.target.value)}
                placeholder="例: 水彩風"
                className={cn(inputClass, "mt-1.5 font-normal")}
              />
            </label>
            <label className="block text-sm font-semibold">
              英語プロンプト（必須）
              <input
                value={itemEn}
                onChange={(e) => setItemEn(e.target.value)}
                placeholder="例: watercolor style"
                className={cn(inputClass, "mt-1.5 font-mono font-normal")}
              />
            </label>

            <div className="flex items-center gap-3">
              <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                {itemImage ? (
                  <img src={itemImage} alt="参考画像" className="size-full object-cover" />
                ) : (
                  <ImagePlus className="size-6 text-muted-foreground/60" aria-hidden />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="h-11 rounded-xl border border-border text-sm font-semibold active:bg-muted"
                >
                  参考画像を選ぶ（任意）
                </button>
                {itemImage && (
                  <button
                    type="button"
                    onClick={() => setItemImage(undefined)}
                    className="h-11 rounded-xl text-sm font-semibold text-muted-foreground active:bg-muted"
                  >
                    画像を外す
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void pickImage(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>

            <button
              type="button"
              onClick={addItem}
              className="h-14 w-full rounded-2xl bg-primary text-base font-bold text-primary-foreground active:opacity-90"
            >
              プロンプトを追加
            </button>
          </div>
        )}

        {tab === "manage" && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-muted-foreground">
              左のハンドルを長押ししてドラッグすると順番を変えられます。
            </p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={categories.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="space-y-2">
                  {categories.map((c) =>
                    editingCat === c.id ? (
                      <li
                        key={c.id}
                        className="space-y-2 rounded-2xl border border-primary bg-accent/40 p-3"
                      >
                        <input
                          value={editEmoji}
                          onChange={(e) => setEditEmoji(e.target.value)}
                          aria-label="絵文字を編集"
                          placeholder="絵文字"
                          className={inputClass}
                        />
                        <input
                          value={editJa}
                          onChange={(e) => setEditJa(e.target.value)}
                          aria-label="カテゴリ名を編集"
                          placeholder="カテゴリ名"
                          className={inputClass}
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={saveCategoryEdit}
                            className="flex h-12 flex-1 items-center justify-center gap-1 rounded-xl bg-primary text-sm font-bold text-primary-foreground active:opacity-90"
                          >
                            <Check className="size-4" />
                            保存
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCat(null)}
                            className="h-12 flex-1 rounded-xl border border-border text-sm font-semibold active:bg-muted"
                          >
                            キャンセル
                          </button>
                        </div>
                      </li>
                    ) : (
                      <SortableCategoryRow
                        key={c.id}
                        category={c}
                        onEdit={() => {
                          setEditingCat(c.id);
                          setEditJa(c.ja);
                          setEditEmoji(c.emoji);
                        }}
                        onDelete={() => setDeleteCat(c)}
                      />
                    ),
                  )}
                </ul>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteCat !== null}
        title={`「${deleteCat?.ja ?? ""}」を削除しますか？`}
        description={
          deleteCat && deleteCat.items.length > 0
            ? `このカテゴリの中にあるプロンプト${deleteCat.items.length}件も一緒に削除されます。元に戻せません。`
            : "このカテゴリを削除します。元に戻せません。"
        }
        confirmLabel="カテゴリを削除"
        onCancel={() => setDeleteCat(null)}
        onConfirm={() => {
          if (deleteCat) onDeleteCategory(deleteCat.id);
          setDeleteCat(null);
          toast.success("カテゴリを削除しました");
        }}
      />
    </div>
  );
}
