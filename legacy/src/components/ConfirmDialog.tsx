type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "削除する",
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6">
      <button
        type="button"
        aria-label="キャンセル"
        onClick={onCancel}
        className="absolute inset-0 bg-foreground/40"
      />
      <div
        role="alertdialog"
        aria-label={title}
        className="relative w-full max-w-sm rounded-3xl bg-card p-5 shadow-2xl"
      >
        <h3 className="text-base font-bold">{title}</h3>
        {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="h-13 w-full rounded-2xl bg-destructive text-base font-bold text-destructive-foreground active:opacity-90"
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-13 w-full rounded-2xl border border-border text-base font-semibold active:bg-muted"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
