import { useState, type FormEvent } from "react";
import {
  applyRange,
  createPage,
  duplicatePage,
  now,
  parseBulkPages,
  progress,
  uid,
} from "../model";
import { useStore } from "../store";
import {
  ConfirmButton,
  Empty,
  Field,
  SectionHeader,
  StatusBadge,
} from "../components/UI";
import {
  STATUSES,
  type Page,
  type Scene,
  type Status,
  type Work,
} from "../types";

type Props = {
  workId: string;
  onBack: () => void;
  onEditPage: (pageId: string) => void;
  onProduce: () => void;
};
type RangeKey = "sceneId" | "background" | "outfit" | "style";

export function WorkView({ workId, onBack, onEditPage, onProduce }: Props) {
  const { data, mutate, notify } = useStore();
  const [filter, setFilter] = useState<Status | "すべて">("すべて");
  const [pageTitle, setPageTitle] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [sceneName, setSceneName] = useState("");
  const [rangeFrom, setRangeFrom] = useState("1");
  const [rangeTo, setRangeTo] = useState("1");
  const [rangeValues, setRangeValues] = useState<Record<RangeKey, string>>({
    sceneId: "",
    background: "",
    outfit: "",
    style: "",
  });
  const [rangeEnabled, setRangeEnabled] = useState<Record<RangeKey, boolean>>({
    sceneId: false,
    background: false,
    outfit: false,
    style: false,
  });
  const work = data.works.find((w) => w.id === workId);

  function editWork(recipe: (target: Work) => void) {
    mutate((draft) => {
      const target = draft.works.find((w) => w.id === workId);
      if (!target) return;
      recipe(target);
      target.updatedAt = now();
    });
  }
  function editScene(id: string, key: keyof Omit<Scene, "id">, value: string) {
    editWork((target) => {
      const scene = target.scenes.find((s) => s.id === id);
      if (scene) scene[key] = value;
    });
  }
  function openPage(id: string) {
    mutate((draft) => {
      draft.settings.activeWorkId = workId;
      draft.settings.activePageId = id;
    });
    onEditPage(id);
  }
  function addPage(event: FormEvent) {
    event.preventDefault();
    if (!work) return;
    const page = createPage(
      work.pages.length + 1,
      pageTitle.trim(),
      data.templates.find((t) => t.id === templateId),
    );
    editWork((target) => target.pages.push(page));
    setPageTitle("");
    notify("ページを追加しました");
    openPage(page.id);
  }
  function addBulk(event: FormEvent) {
    event.preventDefault();
    if (!work) return;
    const pages = parseBulkPages(
      bulkText,
      work.pages.length + 1,
      data.templates.find((t) => t.id === templateId),
    );
    if (pages.length === 0) {
      notify("構成メモを入力してください");
      return;
    }
    editWork((target) => target.pages.push(...pages));
    setBulkText("");
    notify(`${pages.length} ページを追加しました`);
  }
  function changeStatus(id: string, status: Status) {
    editWork((target) => {
      const page = target.pages.find((p) => p.id === id);
      if (page) {
        page.status = status;
        page.updatedAt = now();
      }
    });
  }
  function applySettings(event: FormEvent) {
    event.preventDefault();
    if (!work) return;
    const from = Number(rangeFrom);
    const to = Number(rangeTo);
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 1 ||
      to < from ||
      to > work.pages.length
    ) {
      notify("作品内の有効なページ範囲を指定してください");
      return;
    }
    const patch: Partial<Pick<Page, RangeKey>> = {};
    for (const key of Object.keys(rangeEnabled) as RangeKey[])
      if (rangeEnabled[key]) patch[key] = rangeValues[key];
    if (Object.keys(patch).length === 0) {
      notify("適用する項目を選んでください");
      return;
    }
    if (
      patch.sceneId &&
      !work.scenes.some((scene) => scene.id === patch.sceneId)
    ) {
      notify("適用するシーンを選び直してください");
      return;
    }
    editWork((target) => applyRange(target, from, to, patch));
    notify(`P${from}〜P${to} に設定を適用しました`);
  }

  if (!work)
    return (
      <Empty title="作品が見つかりません">
        <button className="button" onClick={onBack}>
          作品一覧へ
        </button>
      </Empty>
    );
  const stats = progress(work);
  const visiblePages = work.pages.filter(
    (p) => filter === "すべて" || p.status === filter,
  );
  const fields: {
    key: keyof Omit<Scene, "id" | "name">;
    label: string;
    placeholder?: string;
  }[] = [
    { key: "background", label: "背景", placeholder: "office, desk" },
    { key: "outfit", label: "衣装", placeholder: "business suit" },
    { key: "time", label: "時間帯", placeholder: "night" },
    { key: "lighting", label: "ライティング", placeholder: "warm lighting" },
    { key: "prompt", label: "シーン追加プロンプト" },
    { key: "negative", label: "シーンネガティブプロンプト" },
    { key: "memo", label: "シーンメモ" },
  ];

  return (
    <div className="stack">
      <button className="text-button back-link" onClick={onBack}>
        ← 作品一覧
      </button>
      <SectionHeader
        eyebrow="PROJECT WORKBENCH"
        title={work.name || "無題の作品"}
      />
      <section className="card stack" aria-label="作品の進捗">
        <div className="card-header">
          <div>
            <strong>
              {stats.total} ページ中 {stats.completed} ページ完成
            </strong>
            <p className="small muted">次の 1 ページを、ここから。</p>
          </div>
          <strong className="progress-percent">{stats.percent}%</strong>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="作品の完成率"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={stats.percent}
        >
          <div
            className="progress-fill"
            style={{ width: `${stats.percent}%` }}
          />
        </div>
        <div className="chips">
          {STATUSES.map((status) => (
            <button
              key={status}
              className={`chip ${filter === status ? "selected" : ""}`}
              aria-pressed={filter === status}
              onClick={() => setFilter(filter === status ? "すべて" : status)}
            >
              <StatusBadge status={status} />{" "}
              <strong>{stats.counts[status]}</strong>
            </button>
          ))}
        </div>
        <button
          className="button primary"
          disabled={work.pages.length === 0}
          onClick={() => {
            mutate((draft) => {
              draft.settings.activeWorkId = workId;
              if (
                !work.pages.some(
                  (page) => page.id === draft.settings.activePageId,
                )
              )
                draft.settings.activePageId =
                  work.pages.find((page) => page.status !== "完成")?.id ||
                  work.pages[0]?.id ||
                  "";
            });
            onProduce();
          }}
        >
          ▶ 制作モードを開始
        </button>
      </section>

      <details className="card accordion" open={work.pages.length === 0}>
        <summary>＋ ページを追加・一括登録</summary>
        <div className="stack">
          <Field label="ページテンプレート">
            <select
              aria-label="追加ページのテンプレート"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">テンプレートなし</option>
              {data.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <form className="stack" onSubmit={addPage}>
            <Field label="ページタイトル">
              <input
                aria-label="追加ページのタイトル"
                placeholder="例：振り向く"
                value={pageTitle}
                onChange={(e) => setPageTitle(e.target.value)}
              />
            </Field>
            <button className="button primary" type="submit">
              1 ページ追加
            </button>
          </form>
          <form className="stack" onSubmit={addBulk}>
            <Field label="構成メモを一括登録">
              <textarea
                aria-label="一括登録する構成メモ"
                rows={5}
                placeholder={"1|導入\n2|会話\n3|振り向く"}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
            </Field>
            <p className="small muted">
              1 行が 1
              ページ。タイトルだけの改行区切りにも対応します。現在の末尾へ連番で追加します。
            </p>
            <button className="button secondary" type="submit">
              まとめてページを追加
            </button>
          </form>
        </div>
      </details>

      <details className="card accordion">
        <summary>
          シーン設定{" "}
          <span className="small muted">{work.scenes.length} 件</span>
        </summary>
        <div className="stack">
          <p className="small muted">
            シーンを変更すると、このシーンを参照するページの自動プロンプトへすぐ反映されます。
          </p>
          <form
            className="row wrap"
            onSubmit={(e) => {
              e.preventDefault();
              if (!sceneName.trim()) {
                notify("シーン名を入力してください");
                return;
              }
              editWork((target) =>
                target.scenes.push({
                  id: uid(),
                  name: sceneName.trim(),
                  background: "",
                  outfit: "",
                  time: "",
                  lighting: "",
                  prompt: "",
                  negative: "",
                  memo: "",
                }),
              );
              setSceneName("");
              notify("シーンを作成しました");
            }}
          >
            <Field label="新しいシーン名">
              <input
                aria-label="新しいシーン名"
                value={sceneName}
                onChange={(e) => setSceneName(e.target.value)}
                placeholder="例：オフィスの夜"
                required
              />
            </Field>
            <button type="submit" className="button primary">
              シーン追加
            </button>
          </form>
          {work.scenes.length === 0 && (
            <p className="muted">
              共通の背景や衣装をシーンにまとめて、ページへ適用できます。
            </p>
          )}
          {work.scenes.map((scene) => (
            <details className="card accordion" key={scene.id}>
              <summary>
                {scene.name || "無題のシーン"}{" "}
                <span className="small muted">
                  {work.pages.filter((p) => p.sceneId === scene.id).length}{" "}
                  ページ
                </span>
              </summary>
              <div className="stack">
                <Field label="シーン名">
                  <input
                    aria-label={`${scene.name}のシーン名`}
                    value={scene.name}
                    onChange={(e) =>
                      editScene(scene.id, "name", e.target.value)
                    }
                  />
                </Field>
                <div className="field-grid">
                  {fields.map((field) => (
                    <Field label={field.label} key={field.key}>
                      {["prompt", "negative", "memo"].includes(field.key) ? (
                        <textarea
                          aria-label={`${scene.name}の${field.label}`}
                          rows={2}
                          value={scene[field.key]}
                          onChange={(e) =>
                            editScene(scene.id, field.key, e.target.value)
                          }
                        />
                      ) : (
                        <input
                          aria-label={`${scene.name}の${field.label}`}
                          placeholder={field.placeholder}
                          value={scene[field.key]}
                          onChange={(e) =>
                            editScene(scene.id, field.key, e.target.value)
                          }
                        />
                      )}
                    </Field>
                  ))}
                </div>
                <ConfirmButton
                  className="button danger"
                  onConfirm={() => {
                    editWork((target) => {
                      target.scenes = target.scenes.filter(
                        (s) => s.id !== scene.id,
                      );
                      target.pages.forEach((page) => {
                        if (page.sceneId === scene.id) {
                          page.sceneId = "";
                          page.updatedAt = now();
                        }
                      });
                    });
                    notify("シーンを削除しました");
                  }}
                >
                  シーンを削除
                </ConfirmButton>
              </div>
            </details>
          ))}
        </div>
      </details>

      <details className="card accordion">
        <summary>範囲一括設定</summary>
        <form className="stack" onSubmit={applySettings}>
          <p className="small muted">
            チェックした項目だけを指定範囲へ適用します。空欄を適用するとその項目を解除できます。
          </p>
          <div className="field-grid">
            <Field label="開始ページ">
              <input
                aria-label="一括設定の開始ページ"
                type="number"
                min="1"
                max={work.pages.length || 1}
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
              />
            </Field>
            <Field label="終了ページ">
              <input
                aria-label="一括設定の終了ページ"
                type="number"
                min="1"
                max={work.pages.length || 1}
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
              />
            </Field>
          </div>
          {(
            [
              { key: "sceneId", label: "シーン" },
              { key: "background", label: "背景" },
              { key: "outfit", label: "服装" },
              { key: "style", label: "画風" },
            ] as { key: RangeKey; label: string }[]
          ).map((item) => (
            <div className="stack" key={item.key}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={rangeEnabled[item.key]}
                  onChange={(e) =>
                    setRangeEnabled((value) => ({
                      ...value,
                      [item.key]: e.target.checked,
                    }))
                  }
                />
                {item.label}を適用
              </label>
              {item.key === "sceneId" ? (
                <select
                  aria-label="一括適用するシーン"
                  disabled={!rangeEnabled.sceneId}
                  value={rangeValues.sceneId}
                  onChange={(e) =>
                    setRangeValues((value) => ({
                      ...value,
                      sceneId: e.target.value,
                    }))
                  }
                >
                  <option value="">シーンを解除</option>
                  {work.scenes.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label={`一括適用する${item.label}`}
                  disabled={!rangeEnabled[item.key]}
                  value={rangeValues[item.key]}
                  onChange={(e) =>
                    setRangeValues((value) => ({
                      ...value,
                      [item.key]: e.target.value,
                    }))
                  }
                  placeholder="プロンプトを入力"
                />
              )}
            </div>
          ))}
          <button
            type="submit"
            className="button primary"
            disabled={work.pages.length === 0}
          >
            指定範囲へ適用
          </button>
        </form>
      </details>

      <details className="card accordion">
        <summary>作品設定・共通プロンプト</summary>
        <div className="stack">
          <p className="small muted">
            入力内容は自動保存されます。共通設定は全ページの自動プロンプトへ反映されます。
          </p>
          <Field label="作品名">
            <input
              aria-label="作品名"
              value={work.name}
              onChange={(e) =>
                editWork((target) => {
                  target.name = e.target.value;
                })
              }
            />
          </Field>
          <Field label="キャラクタープリセット">
            <select
              aria-label="作品のキャラクタープリセット"
              value={work.characterId}
              onChange={(e) => {
                const character = data.characters.find(
                  (c) => c.id === e.target.value,
                );
                editWork((target) => {
                  target.characterId = character?.id || "";
                  target.characterName = character?.name || "";
                });
              }}
            >
              <option value="">プリセットなし</option>
              {data.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="キャラクター名">
            <input
              aria-label="作品のキャラクター名"
              value={work.characterName}
              onChange={(e) =>
                editWork((target) => {
                  target.characterName = e.target.value;
                })
              }
            />
          </Field>
          <Field label="作品メモ">
            <textarea
              aria-label="作品メモ"
              rows={3}
              value={work.memo}
              onChange={(e) =>
                editWork((target) => {
                  target.memo = e.target.value;
                })
              }
            />
          </Field>
          <Field label="共通プロンプト">
            <textarea
              aria-label="作品の共通プロンプト"
              rows={4}
              placeholder="品質、画風、基本衣装など"
              value={work.commonPrompt}
              onChange={(e) =>
                editWork((target) => {
                  target.commonPrompt = e.target.value;
                })
              }
            />
          </Field>
          <Field label="共通ネガティブプロンプト">
            <textarea
              aria-label="作品の共通ネガティブプロンプト"
              rows={3}
              value={work.commonNegative}
              onChange={(e) =>
                editWork((target) => {
                  target.commonNegative = e.target.value;
                })
              }
            />
          </Field>
        </div>
      </details>

      <section className="stack" aria-label="ページ一覧">
        <div className="section-header">
          <h2>
            ページ <span className="small muted">{work.pages.length}</span>
          </h2>
          <button
            className={`chip ${filter === "すべて" ? "selected" : ""}`}
            aria-pressed={filter === "すべて"}
            onClick={() => setFilter("すべて")}
          >
            すべて
          </button>
        </div>
        {work.pages.length === 0 && (
          <Empty title="最初のページを作りましょう">
            上の「ページを追加」や「構成メモを一括登録」から制作を始められます。
          </Empty>
        )}
        {work.pages.length > 0 && visiblePages.length === 0 && (
          <Empty title="該当するページはありません">
            「すべて」を選ぶと全ページを表示できます。
          </Empty>
        )}
        <div className="page-list">
          {visiblePages.map((page) => (
            <article
              className="card page-row stack"
              style={{ gap: 4 }}
              key={page.id}
            >
              <div className="card-header">
                <button
                  className="page-open text-button"
                  onClick={() => openPage(page.id)}
                >
                  <span className="page-number">
                    {String(page.number).padStart(2, "0")}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <strong
                      style={{
                        display: "block",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {page.title}
                    </strong>
                    {page.memo && (
                      <span
                        className="small muted"
                        style={{
                          display: "block",
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                          marginTop: 3,
                        }}
                      >
                        {page.memo.replace(/\s+/g, " ")}
                      </span>
                    )}
                  </span>
                </button>
                <StatusBadge status={page.status} />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: 8,
                  alignItems: "start",
                }}
              >
                <details
                  className="page-operations"
                  style={{ minWidth: 0, overflowWrap: "anywhere" }}
                >
                  <summary
                    className="small muted"
                    style={{
                      minHeight: 44,
                      display: "flex",
                      alignItems: "center",
                      cursor: "pointer",
                    }}
                  >
                    状態・ページ操作
                  </summary>
                  <div className="stack" style={{ gap: 10 }}>
                    {page.sceneId && (
                      <p className="small muted">
                        シーン：
                        {work.scenes.find((s) => s.id === page.sceneId)?.name ||
                          "未設定"}
                      </p>
                    )}
                    {page.status === "再生成" && (
                      <p className="small revision-note">
                        再生成理由：
                        {page.reasons.length
                          ? page.reasons.join("・")
                          : "未記録"}
                        {page.revisionMemo && ` ／ ${page.revisionMemo}`}
                      </p>
                    )}
                    <div
                      className="status-actions"
                      role="group"
                      aria-label={`P${page.number} の制作状態`}
                    >
                      {STATUSES.map((status) => (
                        <button
                          key={status}
                          className={`chip ${page.status === status ? "selected" : ""}`}
                          aria-pressed={page.status === status}
                          onClick={() => changeStatus(page.id, status)}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                    <div className="row wrap">
                      <button
                        className="button secondary"
                        aria-label={`P${page.number} を複製`}
                        onClick={() => {
                          editWork((target) => {
                            const source = target.pages.find(
                              (p) => p.id === page.id,
                            );
                            if (source) duplicatePage(target, source);
                          });
                          notify("設定を引き継いでページを複製しました");
                        }}
                      >
                        複製
                      </button>
                      <ConfirmButton
                        className="button danger"
                        onConfirm={() => {
                          mutate((draft) => {
                            const target = draft.works.find(
                              (w) => w.id === workId,
                            );
                            if (!target) return;
                            target.pages = target.pages.filter(
                              (p) => p.id !== page.id,
                            );
                            target.pages.forEach((p, i) => {
                              p.number = i + 1;
                            });
                            target.updatedAt = now();
                            if (draft.settings.activePageId === page.id)
                              draft.settings.activePageId =
                                target.pages[0]?.id || "";
                          });
                          notify("ページを削除しました");
                        }}
                      >
                        削除
                      </ConfirmButton>
                    </div>
                  </div>
                </details>
                <button
                  className="button secondary"
                  onClick={() => openPage(page.id)}
                >
                  編集
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
