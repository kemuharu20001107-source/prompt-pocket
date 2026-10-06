import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AppData } from "./types";
import { initialData } from "./seed";
import { loadData, saveData } from "./storage";
interface Store {
  data: AppData;
  mutate: (recipe: (draft: AppData) => void) => void;
  notify: (message: string) => void;
  replace: (data: AppData) => Promise<void>;
  flush: () => Promise<void>;
  saveState: "saved" | "saving" | "error";
  saveError: string;
  retry: () => void;
}
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState<Store["saveState"]>("saved");
  const [saveError, setSaveError] = useState("");
  const [toast, setToast] = useState("");
  const current = useRef<AppData | null>(null);
  const restoring = useRef(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const notify = (message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  };
  const enqueue = (snapshot: AppData) => {
    const version = ++revision.current;
    setSaveState("saving");
    const task = chain.current.catch(() => {}).then(() => saveData(snapshot));
    chain.current = task;
    void task.then(
      () => {
        savedRevision.current = version;
        if (version === revision.current) {
          setSaveState("saved");
          setSaveError("");
        }
      },
      (error) => {
        if (version === revision.current) {
          setSaveState("error");
          setSaveError(
            error instanceof Error ? error.message : "保存に失敗しました。",
          );
        }
      },
    );
    return task;
  };
  useEffect(() => {
    let alive = true;
    loadData()
      .then(
        async (stored) => {
          const loaded = stored || initialData();
          if (!stored) await saveData(loaded);
          if (alive) {
            current.current = loaded;
            setData(loaded);
          }
        },
        (e) => {
          if (alive)
            setLoadError(
              e instanceof Error ? e.message : "読込に失敗しました。",
            );
        },
      )
      .catch((e) => {
        if (alive) setLoadError(String(e));
      });
    return () => {
      alive = false;
      clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (restoring.current || revision.current !== savedRevision.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  if (loadError)
    return (
      <main className="boot">
        <h1>データを読み込めませんでした</h1>
        <p>{loadError}</p>
        <p>
          このブラウザの保存データは削除していません。通常モードで開くか、別のタブを閉じて再読み込みしてください。
        </p>
        <button onClick={() => location.reload()}>再読み込み</button>
      </main>
    );
  if (!data)
    return (
      <main className="boot">
        <span className="brand-icon">P</span>
        <p>作業台を準備しています…</p>
      </main>
    );
  const mutate = (recipe: (draft: AppData) => void) => {
    if (restoring.current) {
      notify("復元中です。完了までお待ちください。");
      return;
    }
    const draft = structuredClone(current.current!);
    recipe(draft);
    current.current = draft;
    setData(draft);
    enqueue(draft);
  };
  const replace = async (next: AppData) => {
    if (restoring.current) throw new Error("復元中です。");
    restoring.current = true;
    setRestoreBusy(true);
    try {
      await chain.current.catch(() => {});
      await saveData(next);
      current.current = next;
      setData(next);
      revision.current++;
      savedRevision.current = revision.current;
      setSaveState("saved");
      setSaveError("");
    } finally {
      restoring.current = false;
      setRestoreBusy(false);
    }
  };
  return (
    <Context.Provider
      value={{
        data,
        mutate,
        notify,
        replace,
        flush: () => chain.current,
        saveState,
        saveError,
        retry: () => enqueue(current.current!),
      }}
    >
      {children}
      {restoreBusy && (
        <div className="restore-overlay" role="status">
          バックアップを復元しています…
        </div>
      )}
      <div
        className={`toast ${toast ? "visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {toast}
      </div>
    </Context.Provider>
  );
}
export function useStore() {
  const context = useContext(Context);
  if (!context) throw new Error("StoreProvider が必要です。");
  return context;
}
