import { useState } from "react";
import {
  BookOpen,
  Play,
  Search,
  Layers,
  Settings,
  Check,
  AlertCircle,
  PanelLeft,
  ArrowUpRight,
} from "lucide-react";
import { useStore } from "./store";
import type { Tab } from "./types";
import { WorksView } from "./views/WorksView";
import { WorkView } from "./views/WorkView";
import { PageView } from "./views/PageView";
import { DictionaryView } from "./views/DictionaryView";
import { PresetsView } from "./views/PresetsView";
import { SettingsView } from "./views/SettingsView";
import { progress } from "./model";

export function App() {
  const { data, saveState, saveError, retry } = useStore();
  const [tab, setTab] = useState<Tab>("works");
  const [workId, setWorkId] = useState("");
  const [editing, setEditing] = useState(false);
  const active = data.works.find((w) => w.id === data.settings.activeWorkId);
  const nav = [
    ["works", "作品", BookOpen],
    ["production", "制作", Play],
    ["dictionary", "辞書", Search],
    ["presets", "プリセット", Layers],
    ["settings", "設定", Settings],
  ] as const;
  const navigate = (next: Tab) => {
    if (next === "works") setWorkId("");
    setTab(next);
    setEditing(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const openWork = (id: string) => {
    setWorkId(id);
    setEditing(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const backToWork = () => {
    setTab("works");
    setWorkId(active?.id || "");
    setEditing(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const showOverview = tab === "works" && !workId && !editing;
  const totals = data.works.reduce(
    (a, w) => {
      const p = progress(w);
      return {
        pages: a.pages + p.total,
        complete: a.complete + p.completed,
        regenerate: a.regenerate + p.counts["再生成"],
      };
    },
    { pages: 0, complete: 0, regenerate: 0 },
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          {" "}
          <span className="brand-icon">P</span>
          <span>
            Prompt Pocket<small>あなたの制作の作業台</small>
          </span>
        </a>
        <p className="sidebar-label">WORKSPACE</p>
        <nav aria-label="サイドナビゲーション">
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-current={tab === id ? "page" : undefined}
              className={tab === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <PanelLeft size={22} />
          <strong>ひとつずつ、物語に。</strong>
          <p>
            構成もプロンプトも進捗も。
            <br />
            いつでも制作の続きを。
          </p>
        </div>
        <small className="sidebar-foot">LOCAL WORKSPACE · VER.1</small>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-icon">P</span>
            <strong>Prompt Pocket</strong>
          </div>
          <span className="desktop-heading">
            制作の作業台{" "}
            <span className="muted">
              / {nav.find((n) => n[0] === tab)?.[1]}
            </span>
          </span>
          <span className={`save-indicator ${saveState}`} role="status">
            {saveState === "saved" ? (
              <Check size={14} />
            ) : (
              <AlertCircle size={14} />
            )}{" "}
            {saveState === "saved"
              ? "保存済み"
              : saveState === "saving"
                ? "保存中…"
                : "保存失敗"}
          </span>
        </header>
        <main className="main-content">
          {saveState === "error" && (
            <div className="save-error" role="alert">
              <strong>変更を保存できていません。</strong>
              <p>{saveError}</p>
              <button onClick={retry}>保存を再試行</button>
              <button onClick={() => navigate("settings")}>
                バックアップへ
              </button>
            </div>
          )}
          {showOverview && (
            <>
              <section className="hero">
                <span className="eyebrow">YOUR CREATIVE WORKSPACE</span>
                <h1>物語の続きを、ここから。</h1>
                <p>構成からプロンプト、完成まで。制作をひとつの場所に。</p>
              </section>
              <div className="overview-stats">
                <div>
                  <span className="stat-icon">
                    <BookOpen size={18} />
                  </span>
                  <span className="muted small">制作中の作品</span>
                  <strong>
                    {data.works.length}
                    <small>作品</small>
                  </strong>
                </div>
                <div>
                  <span className="stat-icon green">
                    <Check size={18} />
                  </span>
                  <span className="muted small">完成したページ</span>
                  <strong>
                    {totals.complete}
                    <small>/ {totals.pages}</small>
                  </strong>
                </div>
                <div>
                  <span className="stat-icon orange">
                    <AlertCircle size={18} />
                  </span>
                  <span className="muted small">再生成のページ</span>
                  <strong>
                    {totals.regenerate}
                    <small>ページ</small>
                  </strong>
                </div>
              </div>
              {active && active.pages.length > 0 && (
                <button
                  className="resume-card"
                  onClick={() => navigate("production")}
                >
                  <span className="resume-icon">
                    <Play size={20} fill="currentColor" />
                  </span>
                  <span>
                    <small>CONTINUE CREATING</small>
                    <strong>{active.name} の制作を続ける</strong>
                  </span>
                  <ArrowUpRight size={20} />
                </button>
              )}
            </>
          )}
          {tab === "works" ? (
            editing ? (
              <PageView
                key="editor"
                onBack={backToWork}
                onPresets={() => navigate("presets")}
              />
            ) : workId ? (
              <WorkView
                key={workId}
                workId={workId}
                onBack={() => {
                  setWorkId("");
                  window.scrollTo({ top: 0, behavior: "instant" });
                }}
                onEditPage={() => {
                  setEditing(true);
                  window.scrollTo({ top: 0, behavior: "instant" });
                }}
                onProduce={() => navigate("production")}
              />
            ) : (
              <WorksView onOpen={openWork} />
            )
          ) : tab === "production" ? (
            <PageView
              key="production"
              production
              onBack={backToWork}
              onPresets={() => navigate("presets")}
            />
          ) : tab === "dictionary" ? (
            <DictionaryView />
          ) : tab === "presets" ? (
            <PresetsView />
          ) : (
            <SettingsView />
          )}
          <footer className="workspace-footer">
            PROMPT POCKET <span>ひとつずつ、物語に。</span>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="メインナビゲーション">
        {nav.map(([id, label, Icon]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            className={tab === id ? "active" : ""}
            onClick={() => navigate(id)}
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
