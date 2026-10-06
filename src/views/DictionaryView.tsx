import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Field, Empty, ConfirmButton, SectionHeader } from "../components/UI";
import { now, togglePrompt, uid } from "../model";
import { useStore } from "../store";
import type { PromptEntry } from "../types";

type DictionaryMode = "all" | "favorites" | "recent";
const WEIGHTS = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5];

function WeightInput({
  id,
  text,
  weight,
  onChange,
}: {
  id?: string;
  text: string;
  weight: number;
  onChange: (value: number) => void;
}) {
  const [value, setValue] = useState(String(weight));
  useEffect(() => setValue(String(weight)), [weight]);
  return (
    <input
      id={id}
      type="number"
      aria-label={`${text}の重みを手入力`}
      min="0.1"
      max="3"
      step="0.01"
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
        const numeric = event.target.valueAsNumber;
        if (Number.isFinite(numeric) && numeric >= 0.1 && numeric <= 3)
          onChange(numeric);
      }}
      onBlur={() => {
        const numeric = Number(value);
        if (!value || !Number.isFinite(numeric) || numeric < 0.1 || numeric > 3)
          setValue(String(weight));
      }}
    />
  );
}

export function DictionaryView({
  compact = false,
  workId,
  pageId,
}: {
  compact?: boolean;
  workId?: string;
  pageId?: string;
}) {
  const { data, mutate, notify } = useStore();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<DictionaryMode>("all");
  const [category, setCategory] = useState("all");
  const [order, setOrder] = useState("name");
  const [newName, setNewName] = useState("");
  const [newText, setNewText] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newMemo, setNewMemo] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const targetWorkId = workId ?? data.settings.activeWorkId;
  const targetPageId = pageId ?? data.settings.activePageId;
  const work = data.works.find((item) => item.id === targetWorkId);
  const page = work?.pages.find((item) => item.id === targetPageId);
  const entries = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return data.dictionary
      .filter(
        (entry) =>
          (category === "all" || entry.categoryId === category) &&
          (mode !== "favorites" || entry.favorite) &&
          (mode !== "recent" || entry.lastUsedAt !== null) &&
          (!search ||
            `${entry.name} ${entry.text} ${entry.memo}`
              .toLocaleLowerCase()
              .includes(search)),
      )
      .sort((a, b) =>
        mode === "recent"
          ? (b.lastUsedAt || "").localeCompare(a.lastUsedAt || "")
          : order === "uses"
            ? b.uses - a.uses || a.name.localeCompare(b.name, "ja")
            : a.name.localeCompare(b.name, "ja"),
      );
  }, [data.dictionary, query, category, mode, order]);

  function updateEntry(id: string, patch: Partial<PromptEntry>) {
    mutate((draft) => {
      const entry = draft.dictionary.find((item) => item.id === id);
      if (entry) Object.assign(entry, patch);
    });
  }
  function selectEntry(id: string) {
    if (!page || !work) {
      notify("作品のページを開くと、タップで追加できます");
      return;
    }
    mutate((draft) => {
      const targetWork = draft.works.find((item) => item.id === targetWorkId);
      const targetPage = targetWork?.pages.find(
        (item) => item.id === targetPageId,
      );
      if (targetPage && targetWork) {
        togglePrompt(draft, targetPage, id);
        targetWork.updatedAt = now();
      }
    });
  }
  function setWeight(id: string, weight: number) {
    if (!Number.isFinite(weight) || weight < 0.1 || weight > 3) return;
    mutate((draft) => {
      const targetWork = draft.works.find((item) => item.id === targetWorkId);
      const targetPage = targetWork?.pages.find(
        (item) => item.id === targetPageId,
      );
      const selection = targetPage?.selections.find(
        (item) => item.promptId === id,
      );
      if (selection && targetPage && targetWork) {
        selection.weight = Math.round(weight * 100) / 100;
        targetPage.updatedAt = now();
        targetWork.updatedAt = now();
      }
    });
  }
  function removeSelection(id: string) {
    mutate((draft) => {
      const targetWork = draft.works.find((item) => item.id === targetWorkId);
      const targetPage = targetWork?.pages.find(
        (item) => item.id === targetPageId,
      );
      if (targetPage && targetWork) {
        targetPage.selections = targetPage.selections.filter(
          (item) => item.promptId !== id,
        );
        targetPage.updatedAt = now();
        targetWork.updatedAt = now();
      }
    });
  }
  function addEntry(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim() || !newText.trim()) return;
    mutate((draft) => {
      let categoryId = newCategory || draft.categories[0]?.id;
      if (!categoryId) {
        categoryId = uid();
        draft.categories.push({ id: categoryId, name: "その他" });
      }
      draft.dictionary.push({
        id: uid(),
        name: newName.trim(),
        text: newText.trim(),
        categoryId,
        favorite: false,
        uses: 0,
        lastUsedAt: null,
        memo: newMemo,
      });
    });
    setNewName("");
    setNewText("");
    setNewMemo("");
    notify("プロンプトを登録しました");
  }
  function addCategory(event: FormEvent) {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name) return;
    if (data.categories.some((item) => item.name === name)) {
      notify("同じ名前のカテゴリがあります");
      return;
    }
    mutate((draft) => {
      draft.categories.push({ id: uid(), name });
    });
    setCategoryName("");
    notify("カテゴリを追加しました");
  }
  function deleteCategory(id: string) {
    mutate((draft) => {
      draft.categories = draft.categories.filter((item) => item.id !== id);
      let fallback = draft.categories.find((item) => item.name === "その他");
      if (!fallback) {
        fallback = { id: uid(), name: "その他" };
        draft.categories.push(fallback);
      }
      const fallbackId = fallback.id;
      draft.dictionary.forEach((entry) => {
        if (entry.categoryId === id) entry.categoryId = fallbackId;
      });
    });
    if (category === id) setCategory("all");
    if (newCategory === id) setNewCategory("");
    notify("カテゴリを削除し、登録項目を「その他」に移しました");
  }

  return (
    <div className="stack dictionary-view">
      {!compact && (
        <SectionHeader eyebrow="PROMPT LIBRARY" title="プロンプト辞書">
          <span className="muted small">{data.dictionary.length} 件登録</span>
        </SectionHeader>
      )}
      {!compact && (
        <div className="card small">
          {page && work ? (
            <>
              <strong>
                {work.name} · P{String(page.number).padStart(2, "0")}{" "}
                {page.title}
              </strong>
              <p className="muted">
                プロンプトをタップして、現在のページへ追加・解除。
              </p>
            </>
          ) : (
            <p className="muted">
              作品からページを開くと、辞書をタップして追加できます。
            </p>
          )}
        </div>
      )}
      {page?.promptOverride != null && (
        <p className="card small">
          完成プロンプトは直接編集中です。設定の変更を反映するには自動生成に戻してください。
        </p>
      )}
      <Field label="プロンプトを検索">
        <input
          type="search"
          aria-label="プロンプトを検索"
          placeholder="日本語の名前・英語のプロンプト"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Field>
      <div className="chips" aria-label="辞書の表示方法">
        {(
          [
            ["all", "すべて"],
            ["favorites", "★ お気に入り"],
            ["recent", "最近使用"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={`chip ${mode === value ? "selected" : ""}`}
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="field-grid">
        <Field label="カテゴリで絞り込み">
          <select
            aria-label="カテゴリで絞り込み"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">全カテゴリ</option>
            {data.categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="並び順">
          <select
            aria-label="辞書の並び順"
            value={order}
            onChange={(event) => setOrder(event.target.value)}
            disabled={mode === "recent"}
          >
            <option value="name">名前順</option>
            <option value="uses">使用回数が多い順</option>
          </select>
        </Field>
      </div>
      {!!page?.selections.length && (
        <details className="card accordion" open>
          <summary>選択中 {page.selections.length} 件 · 重みを調整</summary>
          <div className="stack">
            {page.selections.map((selection) => (
              <div key={selection.promptId} className="weight-editor stack">
                <div className="row">
                  <strong>
                    {data.dictionary.find(
                      (item) => item.id === selection.promptId,
                    )?.name || "保存済みプロンプト"}
                  </strong>
                  <button
                    className="secondary small"
                    aria-label={`${selection.text}を選択解除`}
                    onClick={() => removeSelection(selection.promptId)}
                  >
                    解除
                  </button>
                </div>
                <p className="small prompt-text">{selection.text}</p>
                <div className="chips" aria-label={`${selection.text}の重み`}>
                  {WEIGHTS.map((weight) => (
                    <button
                      key={weight}
                      className={`chip ${selection.weight === weight ? "selected" : ""}`}
                      aria-pressed={selection.weight === weight}
                      onClick={() => setWeight(selection.promptId, weight)}
                    >
                      {weight.toFixed(1)}
                    </button>
                  ))}
                </div>
                <Field label="重みを手入力（0.1〜3.0）">
                  <WeightInput
                    text={selection.text}
                    weight={selection.weight}
                    onChange={(weight) => setWeight(selection.promptId, weight)}
                  />
                </Field>
              </div>
            ))}
            <p className="muted small">
              辞書を編集・削除しても、追加済みのプロンプト本文はページに保持されます。
            </p>
          </div>
        </details>
      )}
      <p className="muted small" aria-live="polite">
        {entries.length} 件表示
      </p>
      <div className="stack dictionary-list">
        {entries.map((entry) => {
          const selected = !!page?.selections.some(
            (item) => item.promptId === entry.id,
          );
          return (
            <article
              className={`card prompt-card ${selected ? "selected" : ""}`}
              key={entry.id}
            >
              <div className="row prompt-card-actions">
                <button
                  className={`prompt-select ${selected ? "selected" : ""}`}
                  aria-label={`${entry.name}を${selected ? "選択解除" : "ページに追加"}`}
                  aria-pressed={selected}
                  onClick={() => selectEntry(entry.id)}
                >
                  <strong>
                    {selected ? "✓ " : "+ "}
                    {entry.name}
                  </strong>
                  <span className="small prompt-text">{entry.text}</span>
                </button>
                <button
                  className={`chip favorite ${entry.favorite ? "selected" : ""}`}
                  aria-label={`${entry.name}のお気に入り${entry.favorite ? "解除" : "登録"}`}
                  aria-pressed={entry.favorite}
                  onClick={() =>
                    updateEntry(entry.id, { favorite: !entry.favorite })
                  }
                >
                  {entry.favorite ? "★" : "☆"}
                </button>
              </div>
              <div className="row muted small">
                <span>
                  {data.categories.find((item) => item.id === entry.categoryId)
                    ?.name || "その他"}
                </span>
                <span>{entry.uses} 回使用</span>
              </div>
              {!compact && (
                <details className="accordion">
                  <summary>{entry.name}を編集</summary>
                  <div className="stack">
                    <Field label="表示名">
                      <input
                        aria-label={`${entry.name}の表示名`}
                        value={entry.name}
                        onChange={(event) =>
                          updateEntry(entry.id, { name: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="出力するプロンプト">
                      <textarea
                        aria-label={`${entry.name}の出力プロンプト`}
                        rows={2}
                        value={entry.text}
                        onChange={(event) =>
                          updateEntry(entry.id, { text: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="カテゴリ">
                      <select
                        aria-label={`${entry.name}のカテゴリ`}
                        value={entry.categoryId}
                        onChange={(event) =>
                          updateEntry(entry.id, {
                            categoryId: event.target.value,
                          })
                        }
                      >
                        {data.categories.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="辞書メモ">
                      <textarea
                        aria-label={`${entry.name}のメモ`}
                        rows={2}
                        value={entry.memo}
                        onChange={(event) =>
                          updateEntry(entry.id, { memo: event.target.value })
                        }
                      />
                    </Field>
                    <p className="muted small">
                      変更は自動保存。追加済みページの本文には影響しません。
                    </p>
                    <ConfirmButton
                      className="danger"
                      onConfirm={() => {
                        mutate((draft) => {
                          draft.dictionary = draft.dictionary.filter(
                            (item) => item.id !== entry.id,
                          );
                        });
                        notify(
                          "辞書から削除しました。ページの選択内容は保持されます",
                        );
                      }}
                    >
                      このプロンプトを削除
                    </ConfirmButton>
                  </div>
                </details>
              )}
            </article>
          );
        })}
        {!entries.length && (
          <Empty title="該当するプロンプトがありません">
            検索語やカテゴリを変更してください。新しいプロンプトも登録できます。
          </Empty>
        )}
      </div>
      {!compact && (
        <>
          <details className="card accordion">
            <summary>＋ プロンプトを登録</summary>
            <form className="stack" onSubmit={addEntry}>
              <Field label="表示名">
                <input
                  aria-label="新しいプロンプトの表示名"
                  required
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="例：こちらを見る"
                />
              </Field>
              <Field label="出力するプロンプト">
                <textarea
                  aria-label="新しい出力プロンプト"
                  required
                  rows={2}
                  value={newText}
                  onChange={(event) => setNewText(event.target.value)}
                  placeholder="looking at viewer"
                />
              </Field>
              <Field label="カテゴリ">
                <select
                  aria-label="新しいプロンプトのカテゴリ"
                  value={newCategory || data.categories[0]?.id || ""}
                  onChange={(event) => setNewCategory(event.target.value)}
                >
                  {data.categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="メモ">
                <textarea
                  aria-label="新しいプロンプトのメモ"
                  rows={2}
                  value={newMemo}
                  onChange={(event) => setNewMemo(event.target.value)}
                />
              </Field>
              <button className="primary" type="submit">
                辞書に登録
              </button>
            </form>
          </details>
          <details className="card accordion">
            <summary>カテゴリを管理</summary>
            <div className="stack">
              {data.categories.map((item) => (
                <div className="row" key={item.id}>
                  <input
                    aria-label={`${item.name}カテゴリ名`}
                    value={item.name}
                    onChange={(event) =>
                      mutate((draft) => {
                        const target = draft.categories.find(
                          (value) => value.id === item.id,
                        );
                        if (target) target.name = event.target.value;
                      })
                    }
                  />
                  <ConfirmButton
                    className="danger"
                    onConfirm={() => deleteCategory(item.id)}
                  >
                    削除
                  </ConfirmButton>
                </div>
              ))}
              <p className="muted small">
                カテゴリを削除すると、その項目は「その他」へ移ります。
              </p>
              <form className="stack" onSubmit={addCategory}>
                <Field label="新しいカテゴリ">
                  <input
                    aria-label="新しいカテゴリ名"
                    required
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                    placeholder="カテゴリ名"
                  />
                </Field>
                <button className="secondary" type="submit">
                  カテゴリを追加
                </button>
              </form>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
