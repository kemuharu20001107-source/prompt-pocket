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
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type TagChip = { id: string; label: string; sub: string };

function Chip({ chip, onRemove }: { chip: TagChip; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chip.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex h-11 touch-none items-center gap-1 rounded-full border bg-card pr-1 pl-1 text-sm font-semibold",
        isDragging ? "border-primary shadow-lg" : "border-border",
      )}
    >
      <button
        type="button"
        aria-label={`${chip.label}を並べ替え`}
        className="flex h-9 w-8 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-5" />
      </button>
      <span className="max-w-36 truncate">{chip.label}</span>
      <button
        type="button"
        onClick={() => onRemove(chip.id)}
        aria-label={`${chip.label}を外す`}
        className="flex size-9 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
      >
        <X className="size-4" />
      </button>
    </li>
  );
}

export function SortableTags({
  chips,
  onReorder,
  onRemove,
}: {
  chips: TagChip[];
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = chips.map((c) => c.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  };

  if (chips.length === 0) return null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={chips.map((c) => c.id)} strategy={rectSortingStrategy}>
        <ul
          aria-label="選択したプロンプトの並び"
          className="mt-2 flex max-h-28 flex-wrap gap-2 overflow-y-auto"
        >
          {chips.map((chip) => (
            <Chip key={chip.id} chip={chip} onRemove={onRemove} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
