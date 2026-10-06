import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Play,
  CheckCircle2,
  RotateCcw,
  SkipForward,
  WandSparkles,
} from "lucide-react";
import { useStore } from "../store";
import {
  assemblePrompt,
  duplicatePage,
  now,
  productionQueue,
  progress,
} from "../model";
import { STATUSES, REASONS, type Page, type Status } from "../types";
import { Empty, Field, SectionHeader, StatusBadge } from "../components/UI";
import { DictionaryView } from "./DictionaryView";

export function PageView({
  production = false,
  onBack,
  onPresets,
}: {
  production?: boolean;
  onBack: () => void;
  onPresets: () => void;
}) {
  const { data, mutate, notify } = useStore();
  const [scope, setScope] = useState<"unfinished" | "regenerate">("unfinished");
  const [done, setDone] = useState(false);
  const [heldPageId, setHeldPageId] = useState("");
  const work = data.works.find((w) => w.id === data.settings.activeWorkId);
  const queue = work ? productionQueue(work, scope) : [];
  const active = work?.pages.find((p) => p.id === data.settings.activePageId);
  const held = work?.pages.find((p) => p.id === heldPageId);
  const page = production
    ? held || queue.find((p) => p.id === active?.id) || queue[0]
    : active;
  useEffect(() => {
    if (production && !done && page && page.id !== data.settings.activePageId)
      mutate((d) => {
        d.settings.activePageId = page.id;
      });
  }, [production, done, page?.id, data.settings.activePageId]);
  function selectPage(id: string) {
    setHeldPageId("");
    mutate((d) => {
      d.settings.activePageId = id;
    });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function edit(patch: Partial<Page>) {
    if (!work || !page) return;
    mutate((d) => {
      const w = d.works.find((w) => w.id === work.id)!;
      const p = w.pages.find((p) => p.id === page.id)!;
      Object.assign(p, patch, { updatedAt: now() });
      w.updatedAt = now();
      d.settings.activePageId = p.id;
    });
  }
  function advance() {
    if (!page) return;
    const next = queue.find((p) => p.number > page.number);
    if (next) selectPage(next.id);
    else setDone(true);
  }
  function status(status: Status) {
    if (production && !data.settings.autoAdvance) setHeldPageId(page?.id || "");
    edit({ status });
    if (production && data.settings.autoAdvance && status !== "再生成")
      advance();
    else
      notify(
        status === "再生成" ? "再生成理由を記録できます" : "状態を変更しました",
      );
  }
  async function copy(text: string) {
    try {
      if (navigator.clipboard && window.isSecureContext)
        await navigator.clipboard.writeText(text);
      else {
        const t = document.createElement("textarea");
        t.value = text;
        t.style.position = "fixed";
        t.style.opacity = "0";
        document.body.appendChild(t);
        t.select();
        const ok = document.execCommand("copy");
        t.remove();
        if (!ok) throw new Error("copy");
      }
      notify("コピーしました");
    } catch {
      notify(
        "コピーできませんでした。プロンプト欄を長押ししてコピーしてください。",
      );
    }
  }
  function restart(nextScope = scope) {
    setHeldPageId("");
    setScope(nextScope);
    setDone(false);
    if (work) {
      const first = productionQueue(work, nextScope)[0];
      if (first) selectPage(first.id);
    }
  }
  if (!work || work.pages.length === 0)
    return (
      <div className="stack">
        <SectionHeader eyebrow="PRODUCTION DESK" title="制作" />
        <Empty
          title={
            work ? "ページを追加して始めましょう" : "作品を選んで始めましょう"
          }
        >
          <p>作品の構成を登録すると、次に作るページを順番に進められます。</p>
          <button className="primary" onClick={onBack}>
            作品へ
          </button>
        </Empty>
        {data.works.length > 0 && (
          <Field label="制作する作品">
            <select
              value={work?.id || ""}
              onChange={(e) =>
                mutate((d) => {
                  d.settings.activeWorkId = e.target.value;
                  d.settings.activePageId =
                    d.works.find((w) => w.id === e.target.value)?.pages[0]
                      ?.id || "";
                })
              }
            >
              <option value="">作品を選択</option>
              {data.works.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
    );
  const stats = progress(work);
  if (production && (done || (queue.length === 0 && !held)))
    return (
      <div className="stack">
        <SectionHeader
          eyebrow="PRODUCTION DESK"
          title="ひと区切り、おつかれさま。"
        />
        <div className="card session-complete">
          <CheckCircle2 size={48} />
          <h2>
            {queue.length === 0
              ? "対象ページはすべて完了しました"
              : "この制作セッションを終えました"}
          </h2>
          <p>
            {stats.completed} / {stats.total} ページ完成 · {stats.percent}%
          </p>
          <p className="muted small">
            生成済み・採用のページは、次のセッションで続きから確認できます。
          </p>
          <div className="row wrap">
            <button className="primary" onClick={() => restart()}>
              もう一度確認する
            </button>
            <button onClick={onBack}>ページ一覧へ</button>
          </div>
        </div>
      </div>
    );
  if (!page)
    return (
      <Empty title="ページを選んでください">
        <button onClick={onBack}>ページ一覧へ</button>
      </Empty>
    );
  const combined = assemblePrompt(data, work, page);
  const finalPrompt = page.promptOverride ?? combined.prompt;
  const finalNegative = page.negativeOverride ?? combined.negative;
  const allIndex = work.pages.findIndex((p) => p.id === page.id);
  const visiblePages = production
    ? held && !queue.some((p) => p.id === held.id)
      ? [...queue, held].sort((a, b) => a.number - b.number)
      : queue
    : work.pages;
  const index = visiblePages.findIndex((p) => p.id === page.id);
  return (
    <div className={`stack page-editor ${production ? "production-mode" : ""}`}>
      <div className="row wrap editor-heading">
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={15} /> ページ一覧
        </button>
        <span className="muted small">
          {production ? "制作モード" : "ページ編集"} · {work.name}
        </span>
      </div>
      {production && (
        <div className="production-toolbar">
          <Field label="制作する作品">
            <select
              value={work.id}
              onChange={(e) => {
                setDone(false);
                setHeldPageId("");
                mutate((d) => {
                  d.settings.activeWorkId = e.target.value;
                  d.settings.activePageId =
                    d.works
                      .find((w) => w.id === e.target.value)
                      ?.pages.find((p) => p.status !== "完成")?.id || "";
                });
              }}
            >
              {data.works.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="chips">
            <button
              className={`chip ${scope === "unfinished" ? "selected" : ""}`}
              onClick={() => restart("unfinished")}
            >
              未完成を順番に
            </button>
            <button
              className={`chip ${scope === "regenerate" ? "selected" : ""}`}
              onClick={() => restart("regenerate")}
            >
              再生成だけ
            </button>
          </div>
        </div>
      )}
      <section className="card current-page">
        <div className="card-header">
          <span className="page-number large">
            P{String(page.number).padStart(2, "0")}
          </span>
          <StatusBadge status={page.status} />
        </div>
        <h1>{page.title}</h1>
        <p className="page-content">
          {page.memo ||
            "このページで描く内容を、下の「構成・ページ設定」にメモできます。"}
        </p>
        <div className="row wrap muted small">
          <span>
            {page.sceneId
              ? work.scenes.find((s) => s.id === page.sceneId)?.name
              : "シーン未設定"}
          </span>
          <span>·</span>
          <span>
            {production
              ? `${index + 1} / ${visiblePages.length} 対象ページ`
              : `${allIndex + 1} / ${work.pages.length} ページ`}
          </span>
        </div>
      </section>
      <section className="card stack prompt-output">
        <div className="card-header">
          <h2>
            <WandSparkles size={18} /> 完成プロンプト
          </h2>
          <span
            className={`small ${page.promptOverride !== null ? "accent" : "muted"}`}
          >
            {page.promptOverride !== null ? "直接編集中" : "自動合成"}
          </span>
        </div>
        <textarea
          aria-label="完成プロンプト"
          className="prompt-textarea"
          rows={5}
          value={finalPrompt}
          onChange={(e) => edit({ promptOverride: e.target.value })}
          placeholder="共通設定・シーン・辞書からプロンプトを作りましょう"
        />
        <div className="row wrap">
          <button
            className="primary copy-button"
            onClick={() => copy(finalPrompt)}
          >
            <Copy size={16} /> プロンプトをコピー
          </button>
          {page.promptOverride !== null && (
            <button
              className="small"
              onClick={() => edit({ promptOverride: null })}
            >
              <RotateCcw size={14} /> 自動生成に戻す
            </button>
          )}
        </div>
        <p className="muted small composition-hint">
          作品共通 → キャラクター → シーン → ページ → 辞書選択
        </p>
        {page.promptOverride !== null && (
          <p className="notice small">
            直接編集した内容を保持しています。設定変更を取り込むときは「自動生成に戻す」を選んでください。
          </p>
        )}
        <details className="accordion">
          <summary>
            ネガティブプロンプト{" "}
            <span className="muted small">
              {finalNegative ? "設定あり" : "未設定"}
            </span>
          </summary>
          <div className="stack">
            <textarea
              aria-label="完成ネガティブプロンプト"
              rows={3}
              value={finalNegative}
              onChange={(e) => edit({ negativeOverride: e.target.value })}
            />
            <div className="row wrap">
              <button onClick={() => copy(finalNegative)}>
                <Copy size={15} /> ネガティブをコピー
              </button>
              {page.negativeOverride !== null && (
                <button onClick={() => edit({ negativeOverride: null })}>
                  ネガティブを自動生成に戻す
                </button>
              )}
            </div>
          </div>
        </details>
      </section>
      <section className="card stack production-status">
        <div className="card-header">
          <h2>制作状態</h2>
          {production && (
            <span className="muted small">
              {data.settings.autoAdvance ? "選ぶと次へ" : "自動移動オフ"}
            </span>
          )}
        </div>
        <div className="status-grid">
          {STATUSES.map((s, i) => (
            <button
              key={s}
              className={`status-choice status-${i} ${page.status === s ? "active" : ""}`}
              aria-pressed={page.status === s}
              onClick={() => status(s)}
            >
              <span className="status-dot" />
              {s}
              {page.status === s && <span>✓</span>}
            </button>
          ))}
        </div>
        {page.status === "再生成" && (
          <div className="stack revision-panel">
            <strong>どこを直す？</strong>
            <div className="chips">
              {REASONS.map((reason) => (
                <button
                  key={reason}
                  className={`chip ${page.reasons.includes(reason) ? "selected" : ""}`}
                  aria-pressed={page.reasons.includes(reason)}
                  onClick={() =>
                    edit({
                      reasons: page.reasons.includes(reason)
                        ? page.reasons.filter((r) => r !== reason)
                        : [...page.reasons, reason],
                    })
                  }
                >
                  {reason}
                </button>
              ))}
            </div>
            <Field label="修正メモ">
              <textarea
                aria-label="修正メモ"
                rows={2}
                value={page.revisionMemo}
                onChange={(e) => edit({ revisionMemo: e.target.value })}
              />
            </Field>
            {production && (
              <button className="primary" onClick={advance}>
                理由を記録して次へ <ArrowRight size={15} />
              </button>
            )}
          </div>
        )}
        {production && (
          <button className="text-button" onClick={advance}>
            <SkipForward size={15} /> このページはあとで
          </button>
        )}
      </section>
      <details className="card accordion">
        <summary>構成・ページ設定</summary>
        <div className="stack">
          <Field label="ページタイトル">
            <input
              aria-label="ページタイトル"
              value={page.title}
              onChange={(e) => edit({ title: e.target.value })}
            />
          </Field>
          <Field label="内容 / 構成メモ">
            <textarea
              aria-label="内容 / 構成メモ"
              rows={3}
              value={page.memo}
              onChange={(e) => edit({ memo: e.target.value })}
            />
          </Field>
          <Field label="シーン">
            <select
              aria-label="ページのシーン"
              value={page.sceneId}
              onChange={(e) => edit({ sceneId: e.target.value })}
            >
              <option value="">シーンなし</option>
              {work.scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ページ固有プロンプト">
            <textarea
              aria-label="ページ固有プロンプト"
              rows={4}
              value={page.prompt}
              onChange={(e) => edit({ prompt: e.target.value })}
            />
          </Field>
          <Field label="ページのネガティブプロンプト">
            <textarea
              aria-label="ページのネガティブプロンプト"
              rows={2}
              value={page.negative}
              onChange={(e) => edit({ negative: e.target.value })}
            />
          </Field>
          <div className="field-grid">
            <Field label="ページ固有の背景">
              <input
                value={page.background}
                onChange={(e) => edit({ background: e.target.value })}
              />
            </Field>
            <Field label="ページ固有の衣装">
              <input
                value={page.outfit}
                onChange={(e) => edit({ outfit: e.target.value })}
              />
            </Field>
            <Field label="ページ固有の画風">
              <input
                value={page.style}
                onChange={(e) => edit({ style: e.target.value })}
              />
            </Field>
          </div>
          {page.status !== "再生成" && (
            <Field label="修正メモ">
              <textarea
                value={page.revisionMemo}
                onChange={(e) => edit({ revisionMemo: e.target.value })}
              />
            </Field>
          )}
          <div className="row wrap">
            <button
              onClick={() => {
                setHeldPageId("");
                let id = "";
                mutate((d) => {
                  const w = d.works.find((w) => w.id === work.id)!;
                  id = duplicatePage(
                    w,
                    w.pages.find((p) => p.id === page.id)!,
                  ).id;
                  w.updatedAt = now();
                  d.settings.activePageId = id;
                });
                notify("ページを複製しました");
              }}
            >
              このページを複製
            </button>
            <button onClick={onPresets}>テンプレート・プリセットへ</button>
          </div>
        </div>
      </details>
      <details className="card accordion">
        <summary>
          辞書からタップで追加{" "}
          <span className="small muted">{page.selections.length} 件選択</span>
        </summary>
        <div className="accordion-content">
          <DictionaryView compact workId={work.id} pageId={page.id} />
        </div>
      </details>
      <div className="page-navigation">
        <button
          disabled={index <= 0}
          onClick={() => selectPage(visiblePages[index - 1].id)}
        >
          <ArrowLeft size={16} /> 前ページ
        </button>
        <Field label="ページへ移動">
          <select
            aria-label="編集ページへ移動"
            value={page.id}
            onChange={(e) => selectPage(e.target.value)}
          >
            {visiblePages.map((p) => (
              <option key={p.id} value={p.id}>
                P{p.number} {p.title}
              </option>
            ))}
          </select>
        </Field>
        <button
          disabled={index === visiblePages.length - 1}
          onClick={() => selectPage(visiblePages[index + 1].id)}
        >
          次ページ <ArrowRight size={16} />
        </button>
      </div>
      <div className="quick-actions">
        <button className="primary" onClick={() => copy(finalPrompt)}>
          <Copy size={16} /> コピー
        </button>
        <button onClick={() => copy(finalNegative)}>ネガティブ</button>
        <button className="finish-action" onClick={() => status("完成")}>
          <CheckCircle2 size={16} /> 完成
          {production && data.settings.autoAdvance ? "・次へ" : ""}
        </button>
      </div>
    </div>
  );
}
