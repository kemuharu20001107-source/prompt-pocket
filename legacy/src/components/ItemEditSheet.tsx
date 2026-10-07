import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, X } from "lucide-react";
import type { PromptItem } from "@/data/prompts";
import { fileToCompressedDataUrl } from "@/lib/prompt-store";
import { cn } from "@/lib/utils";

type Props = {
  item: PromptItem | null;
  onClose: () => void;
  onSave: (id: string, ja: string, en: string, image?: string) => void;
};

const inputClass =
  "h-13 w-full rounded-2xl border border-input bg-background px-4 text-base outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/30";

export function ItemEditSheet({ item, onClose, onSave }: Props) {
  const [ja, setJa] = useState("");
  const [en, setEn] = useState("");
  const [image, setImage] = useState<string | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!item) return;
    setJa(item.ja);
    setEn(item.en);
    setImage(item.image);
  }, [item]);

  if (!item) return null;

  const save = () => {
    if (!ja.trim() || !en.trim()) {
      toast.error("日本語ラベルと英語プロンプトは必須です");
      return;
    }
    onSave(item.id, ja.trim(), en.trim(), image);
    toast.success("保存しました");
    onClose();
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      setImage(await fileToCompressedDataUrl(file));
    } catch {
      toast.error("画像を読み込めませんでした");
    }
  };

  return (
    <div className="fixed inset-0 z-[55] flex flex-col justify-end">
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40"
      />
      <div className="relative max-h-[88vh] overflow-y-auto rounded-t-3xl bg-card px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">プロンプトを編集</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="編集を閉じる"
            className="flex size-11 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-3 space-y-3">
          <label className="block text-sm font-semibold">
            日本語ラベル
            <input
              value={ja}
              onChange={(e) => setJa(e.target.value)}
              placeholder="日本語ラベル"
              className={cn(inputClass, "mt-1.5 font-normal")}
            />
          </label>
          <label className="block text-sm font-semibold">
            英語プロンプト
            <input
              value={en}
              onChange={(e) => setEn(e.target.value)}
              placeholder="english prompt"
              className={cn(inputClass, "mt-1.5 font-mono font-normal")}
            />
          </label>

          <div className="flex items-center gap-3">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
              {image ? (
                <img src={image} alt="参考画像" className="size-full object-cover" />
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
                参考画像を変更
              </button>
              {image && (
                <button
                  type="button"
                  onClick={() => setImage(undefined)}
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
            onClick={save}
            className="h-14 w-full rounded-2xl bg-primary text-base font-bold text-primary-foreground active:opacity-90"
          >
            保存する
          </button>
        </div>
      </div>
    </div>
  );
}
