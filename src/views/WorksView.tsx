import { useState, type FormEvent } from "react";
import { createPage, createWork, progress } from "../model";
import { useStore } from "../store";
import { ConfirmButton, Empty, Field, SectionHeader } from "../components/UI";

const formatDate = (date: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(new Date(date));

export function WorksView({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, mutate, notify } = useStore();
  const [name, setName] = useState("");
  const [characterId, setCharacterId] = useState("");
  const [pageCount, setPageCount] = useState("0");
  const [creating, setCreating] = useState(false);

  function addWork(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      notify("作品名を入力してください");
      return;
    }
    const count = Number(pageCount);
    if (!Number.isInteger(count) || count < 0 || count > 100) {
      notify("ページ数は 0〜100 の整数で指定してください");
      return;
    }
    const character = data.characters.find((c) => c.id === characterId);
    const work = createWork(name.trim(), character?.id, character?.name);
    work.pages = Array.from({ length: count }, (_, i) => createPage(i + 1));
    mutate((draft) => {
      draft.works.push(work);
      draft.settings.activeWorkId = work.id;
      draft.settings.activePageId = work.pages[0]?.id || "";
    });
    setName("");
    setPageCount("0");
    setCreating(false);
    notify("作品を作成しました");
    onOpen(work.id);
  }

  function openWork(id: string) {
    mutate((draft) => {
      draft.settings.activeWorkId = id;
      const work = draft.works.find((w) => w.id === id);
      if (!work?.pages.some((p) => p.id === draft.settings.activePageId))
        draft.settings.activePageId = work?.pages[0]?.id || "";
    });
    onOpen(id);
  }

  return (
    <div className="stack">
      <SectionHeader eyebrow="YOUR WORKSPACE" title="作品">
        <button
          className="button primary"
          onClick={() => setCreating(!creating)}
          aria-expanded={creating}
        >
          ＋ 作品を作る
        </button>
      </SectionHeader>
      <p className="muted">
        構成からプロンプト、完成まで。作品ごとに制作を進めましょう。
      </p>
      {(creating || data.works.length === 0) && (
        <form className="card stack" onSubmit={addWork}>
          <h2>新しい作品</h2>
          <Field label="作品名">
            <input
              aria-label="新しい作品名"
              placeholder="例：夜明けのオフィス"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              required
            />
          </Field>
          <div className="field-grid">
            <Field label="キャラクター">
              <select
                aria-label="作品作成時のキャラクター"
                value={characterId}
                onChange={(e) => setCharacterId(e.target.value)}
              >
                <option value="">あとで設定する</option>
                {data.characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="最初に作るページ数">
              <input
                aria-label="最初に作るページ数"
                type="number"
                min="0"
                max="100"
                value={pageCount}
                onChange={(e) => setPageCount(e.target.value)}
              />
            </Field>
          </div>
          <p className="small muted">
            0 ページから始めて、あとで構成メモを一括登録することもできます。
          </p>
          <button className="button primary" type="submit">
            作品を作成
          </button>
        </form>
      )}
      {data.works.length === 0 && (
        <Empty title="まだ作品がありません">
          作品名を入力して、最初の作業台を作りましょう。
        </Empty>
      )}
      {[...data.works]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((work) => {
          const stats = progress(work);
          return (
            <article className="card stack" key={work.id}>
              <div className="card-header">
                <div>
                  <h2>
                    <button
                      className="text-button"
                      onClick={() => openWork(work.id)}
                    >
                      {work.name || "無題の作品"}
                    </button>
                  </h2>
                  <p className="small muted">
                    {work.characterName || "キャラクター未設定"}
                  </p>
                </div>
                <span className="progress-percent">{stats.percent}%</span>
              </div>
              <div
                className="progress-track"
                role="progressbar"
                aria-label={`${work.name}の進捗`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={stats.percent}
              >
                <div
                  className="progress-fill"
                  style={{ width: `${stats.percent}%` }}
                />
              </div>
              <p>
                <strong>
                  {stats.completed} / {stats.total} ページ完成
                </strong>
                {stats.counts["再生成"] > 0 && (
                  <span className="small muted">
                    {" "}
                    ・再生成 {stats.counts["再生成"]} ページ
                  </span>
                )}
              </p>
              {work.memo && <p className="muted work-memo">{work.memo}</p>}
              <p className="small muted">
                作成 {formatDate(work.createdAt)} ・更新{" "}
                {formatDate(work.updatedAt)}
              </p>
              <div className="row wrap">
                <button
                  className="button primary"
                  onClick={() => openWork(work.id)}
                >
                  作品を開く →
                </button>
                <ConfirmButton
                  className="button danger"
                  onConfirm={() => {
                    mutate((draft) => {
                      draft.works = draft.works.filter((w) => w.id !== work.id);
                      if (draft.settings.activeWorkId === work.id) {
                        draft.settings.activeWorkId = "";
                        draft.settings.activePageId = "";
                      }
                    });
                    notify("作品を削除しました");
                  }}
                >
                  作品を削除
                </ConfirmButton>
              </div>
            </article>
          );
        })}
    </div>
  );
}
