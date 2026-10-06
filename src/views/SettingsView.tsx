import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Field, SectionHeader } from "../components/UI";
import { demoWork } from "../seed";
import { exportJSON, importJSON } from "../storage";
import { useStore } from "../store";
import type { AppData } from "../types";

const MAX_BACKUP_SIZE = 20 * 1024 * 1024;
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "処理を完了できませんでした。";
function backupStamp() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}_${value("hour")}-${value("minute")}`;
}

export function SettingsView() {
  const { data, mutate, notify, replace, flush, saveState, saveError, retry } =
    useStore();
  const latestData = useRef(data);
  latestData.current = data;
  const [busy, setBusy] = useState<"" | "export" | "read" | "restore">("");
  const [jsonText, setJsonText] = useState("");
  const [prepared, setPrepared] = useState<AppData | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [error, setError] = useState("");
  const [lastExportAt, setLastExportAt] = useState<Date | null>(null);
  const totalPages = data.works.reduce(
    (sum, work) => sum + work.pages.length,
    0,
  );

  async function exportBackup() {
    setBusy("export");
    setError("");
    try {
      // A backup must remain available even when browser persistence fails.
      await flush().catch(() => {});
      const json = exportJSON(latestData.current);
      const url = URL.createObjectURL(
        new Blob([json], { type: "application/json" }),
      );
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = `prompt-pocket-${backupStamp()}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setLastExportAt(new Date());
      notify("バックアップを書き出しました");
    } catch (reason) {
      setError(`バックアップを作成できませんでした。${errorMessage(reason)}`);
    } finally {
      setBusy("");
    }
  }

  function prepare(text: string, name: string) {
    const next = importJSON(text);
    setPrepared(next);
    setSourceName(name);
    setError("");
  }
  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPrepared(null);
    setError("");
    setBusy("read");
    try {
      if (file.size > MAX_BACKUP_SIZE)
        throw new Error("バックアップは 20 MB 以下にしてください。");
      prepare(await file.text(), file.name);
    } catch (reason) {
      setError(`バックアップを読み込めませんでした。${errorMessage(reason)}`);
    } finally {
      setBusy("");
    }
  }
  function readText(event: FormEvent) {
    event.preventDefault();
    setPrepared(null);
    setError("");
    try {
      prepare(jsonText, "貼り付けた JSON");
    } catch (reason) {
      setError(`バックアップを読み込めませんでした。${errorMessage(reason)}`);
    }
  }
  async function restoreBackup() {
    if (!prepared) return;
    setBusy("restore");
    setError("");
    try {
      await replace(prepared);
      setPrepared(null);
      setSourceName("");
      setJsonText("");
      notify("全データを復元しました");
    } catch (reason) {
      setError(
        `復元できませんでした。現在のデータは保持しています。${errorMessage(reason)}`,
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="stack">
      <SectionHeader eyebrow="YOUR POCKET" title="設定・バックアップ" />
      <section className="card stack">
        <h2>制作の操作</h2>
        <label className="checkbox-label">
          <input
            type="checkbox"
            disabled={!!busy}
            checked={data.settings.autoAdvance}
            onChange={(event) =>
              mutate((draft) => {
                draft.settings.autoAdvance = event.target.checked;
              })
            }
          />
          状態を変更したら次のページへ進む
        </label>
        <p className="small muted">
          制作モードで有効になります。オフにすると、状態を変更したあとも同じページで作業できます。
        </p>
      </section>

      <section className="card stack" aria-label="データ保存状態">
        <h2>このブラウザの保存データ</h2>
        <p>
          <strong>
            {data.works.length} 作品 / {totalPages} ページ
          </strong>{" "}
          ・辞書 {data.dictionary.length} 件
        </p>
        <p className="small muted">
          入力内容は自動保存されます。作品、ページ、辞書、プリセット、キャラクター、シーン、使用履歴、設定を、このブラウザの
          IndexedDB に保存しています。
        </p>
        <p className="small">
          保存状態：
          {saveState === "saved"
            ? "保存済み"
            : saveState === "saving"
              ? "保存中…"
              : "保存に失敗しています"}
        </p>
        {saveState === "error" && (
          <div className="stack">
            <p className="small danger" role="alert">
              {saveError || "ブラウザの空き容量などを確認してください。"}
            </p>
            <button className="button secondary" onClick={retry}>
              保存を再試行
            </button>
          </div>
        )}
      </section>

      <section className="card stack" aria-label="バックアップの書き出し">
        <h2>バックアップ</h2>
        <p className="small muted">
          全データを JSON
          ファイルで保存します。端末やブラウザを変更するときや、ブラウザのデータを消す前に書き出してください。
        </p>
        <button
          className="button primary"
          disabled={!!busy}
          onClick={() => {
            void exportBackup();
          }}
        >
          {busy === "export" ? "書き出し中…" : "全データを JSON エクスポート"}
        </button>
        {lastExportAt && (
          <p className="small muted">
            今回の書き出し：
            {new Intl.DateTimeFormat("ja-JP", {
              timeZone: "Asia/Tokyo",
              dateStyle: "short",
              timeStyle: "short",
            }).format(lastExportAt)}
          </p>
        )}
        <p className="small muted">
          iPhone
          ではダウンロード後、「ファイル」などへ保存してください。定期的なバックアップをおすすめします。
        </p>
      </section>

      <section className="card stack" aria-label="バックアップからの復元">
        <h2>JSON から復元</h2>
        <p className="small muted">
          Prompt Pocket
          のバックアップファイルを選んでください。内容を検証してから、復元するデータを確認できます。
        </p>
        <Field label="バックアップファイル（20 MB 以下）">
          <input
            aria-label="復元する JSON ファイル"
            type="file"
            accept=".json,application/json"
            disabled={!!busy}
            onChange={(event) => {
              void readFile(event);
            }}
          />
        </Field>
        {busy === "read" && (
          <p className="small" role="status">
            バックアップを検証しています…
          </p>
        )}
        <details className="accordion">
          <summary>JSON を貼り付けて復元</summary>
          <form className="stack" onSubmit={readText}>
            <Field label="バックアップ JSON">
              <textarea
                aria-label="復元するバックアップ JSON"
                rows={6}
                value={jsonText}
                disabled={!!busy}
                onChange={(event) => {
                  setJsonText(event.target.value);
                  setPrepared(null);
                }}
                placeholder="バックアップの JSON をここに貼り付け"
                spellCheck={false}
              />
            </Field>
            <button
              className="button secondary"
              type="submit"
              disabled={!!busy || !jsonText.trim()}
            >
              JSON の内容を確認
            </button>
          </form>
        </details>
        {prepared && (
          <div className="card stack" role="region" aria-label="復元内容の確認">
            <h3>復元内容を確認</h3>
            <p className="small muted">{sourceName}</p>
            <p>
              <strong>
                {prepared.works.length} 作品 /{" "}
                {prepared.works.reduce(
                  (sum, work) => sum + work.pages.length,
                  0,
                )}{" "}
                ページ
              </strong>
            </p>
            <p className="small">
              辞書 {prepared.dictionary.length} 件 ・キャラクター{" "}
              {prepared.characters.length} 件<br />
              プリセット {prepared.presets.length} 件 ・テンプレート{" "}
              {prepared.templates.length} 件 ・シーン{" "}
              {prepared.works.reduce(
                (sum, work) => sum + work.scenes.length,
                0,
              )}{" "}
              件
            </p>
            <p className="small danger">
              <strong>現在の全データを置き換えます。</strong>
              先に現在のデータをバックアップしてください。復元は取り消せません。
            </p>
            <button
              className="button primary"
              disabled={!!busy}
              onClick={() => {
                void restoreBackup();
              }}
            >
              {busy === "restore" ? "復元中…" : "全データを置き換えて復元"}
            </button>
            <button
              className="button secondary"
              disabled={!!busy}
              onClick={() => {
                setPrepared(null);
                setSourceName("");
              }}
            >
              復元をキャンセル
            </button>
          </div>
        )}
      </section>

      {error && (
        <p className="card danger small" role="alert">
          {error}
        </p>
      )}

      <section className="card stack">
        <h2>保存とプライバシー</h2>
        <p className="small muted">
          作品やプロンプトを外部サーバーへ送信しません。ユーザー登録、API
          キー、クラウド同期はありません。
        </p>
        <p className="small muted">
          データは同じ端末・ブラウザ・URL で開くと利用できます。iPhone でも
          Safari
          と別のブラウザでは保存場所が異なります。プライベートブラウズやブラウザデータの削除で保存内容が消えることがあるため、JSON
          バックアップを保管してください。
        </p>
      </section>

      <section className="card stack">
        <h2>サンプルで試す</h2>
        <p className="small muted">
          6 ページのサンプル作品を追加します。今のデータはそのまま残ります。
        </p>
        <button
          className="button secondary"
          disabled={!!busy}
          onClick={() => {
            const work = demoWork();
            mutate((draft) => {
              draft.works.push(work);
              draft.settings.activeWorkId = work.id;
              draft.settings.activePageId =
                work.pages.find((page) => page.status !== "完成")?.id ||
                work.pages[0]?.id ||
                "";
            });
            notify("サンプル作品を追加しました。作品タブから開けます");
          }}
        >
          サンプル作品を追加
        </button>
        <p className="small muted">
          Prompt Pocket Ver.1 ・ローカル制作の作業台
        </p>
      </section>
    </div>
  );
}
