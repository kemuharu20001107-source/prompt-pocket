import { useState, type FormEvent } from 'react';
import { Field, Empty, ConfirmButton, SectionHeader } from '../components/UI';
import { joinPrompt, now, uid } from '../model';
import { useStore } from '../store';
import type { Preset } from '../types';

type Kind = 'presets' | 'characters' | 'templates';
const LABELS: Record<Kind, string> = { presets: '組み合わせ', characters: 'キャラクター', templates: 'ページテンプレート' };

export function PresetsView() {
  const { data, mutate, notify } = useStore();
  const [kind, setKind] = useState<Kind>('presets');
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [negative, setNegative] = useState('');
  const [memo, setMemo] = useState('');
  const [templateConfirm, setTemplateConfirm] = useState('');
  const work = data.works.find(item => item.id === data.settings.activeWorkId);
  const page = work?.pages.find(item => item.id === data.settings.activePageId);

  function update(id: string, patch: Partial<Preset>) {
    mutate(draft => { const target = draft[kind].find(item => item.id === id); if (target) Object.assign(target, patch); });
  }
  function add(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    mutate(draft => { draft[kind].push({ id: uid(), name: name.trim(), prompt: prompt.trim(), negative: negative.trim(), memo }); });
    setName(''); setPrompt(''); setNegative(''); setMemo(''); notify(`${LABELS[kind]}を保存しました`);
  }
  function remove(id: string) {
    mutate(draft => {
      if (kind === 'characters') {
        const character = draft.characters.find(item => item.id === id);
        draft.works.forEach(target => {
          if (target.characterId === id) {
            target.characterName = character?.name || target.characterName;
            // Keep the current character settings usable after removing the preset.
            target.commonPrompt = joinPrompt(target.commonPrompt, character?.prompt);
            target.commonNegative = joinPrompt(target.commonNegative, character?.negative);
            target.characterId = ''; target.updatedAt = now();
          }
        });
      }
      draft[kind] = draft[kind].filter(item => item.id !== id);
    });
    notify(kind === 'characters' ? 'キャラクターを削除しました。使用中の作品には名前とプロンプトを保持しました' : `${LABELS[kind]}を削除しました`);
  }
  function apply(item: Preset) {
    if (kind === 'characters') {
      if (!work) { notify('先に作品を開いてください'); return; }
      mutate(draft => {
        const target = draft.works.find(value => value.id === work.id);
        if (target) { target.characterId = item.id; target.characterName = item.name; target.updatedAt = now(); }
      });
      notify(`${work.name}のキャラクターを設定しました`);
      return;
    }
    if (!page || !work) { notify('先に作品のページを開いてください'); return; }
    mutate(draft => {
      const targetWork = draft.works.find(value => value.id === work.id);
      const targetPage = targetWork?.pages.find(value => value.id === page.id);
      if (!targetPage || !targetWork) return;
      if (kind === 'templates') { targetPage.prompt = item.prompt; targetPage.negative = item.negative; targetPage.memo = item.memo; }
      else { targetPage.prompt = joinPrompt(targetPage.prompt, item.prompt); targetPage.negative = joinPrompt(targetPage.negative, item.negative); }
      targetPage.promptOverride = null; targetPage.negativeOverride = null;
      targetPage.updatedAt = now(); targetWork.updatedAt = now();
    });
    notify(kind === 'templates' ? 'ページにテンプレートを適用しました' : 'ページにプリセットを追加しました');
  }
  function saveCurrent() {
    if (!work || (kind !== 'characters' && !page)) { notify(kind === 'characters' ? '先に作品を開いてください' : '先に作品のページを開いてください'); return; }
    if (kind === 'characters') { setName(work.characterName || '新しいキャラクター'); setPrompt(''); setNegative(''); setMemo(''); }
    else if (page) { setName(page.title); setPrompt(page.prompt); setNegative(page.negative); setMemo(page.memo); }
    notify('登録フォームに読み込みました。名前と内容を確認して保存してください');
  }

  return <div className="stack presets-view">
    <SectionHeader eyebrow="YOUR TOOLKIT" title="プリセット"><span className="muted small">よく使う設定を、すぐ呼び出す</span></SectionHeader>
    <div className="chips" aria-label="プリセットの種類">{(Object.keys(LABELS) as Kind[]).map(value => <button className={`chip ${kind === value ? 'selected' : ''}`} key={value} aria-pressed={kind === value} onClick={() => { setKind(value); setName(''); setPrompt(''); setNegative(''); setMemo(''); }}>{LABELS[value]}</button>)}</div>
    <div className="card small"><strong>{work ? `${work.name}${kind !== 'characters' && page ? ` · P${String(page.number).padStart(2, '0')} ${page.title}` : ''}` : '作品を開いて設定を適用'}</strong><p className="muted">{kind === 'characters' ? '作品にひもづけると、全ページへキャラクター設定が反映されます。作品作成時にも選べます。' : kind === 'templates' ? '構図・ネガティブ・メモをまとめて適用。ページ作成時にも選べます。現在のページへ適用すると、その3項目と完成プロンプトの直接編集を置き換えます。' : 'タップで現在のページへ追加。完成プロンプトを直接編集している場合は、設定からの自動生成に戻ります。'}</p></div>
    <div className="stack">
      {data[kind].map(item => <article className="card stack" key={item.id}>
        <div className="row"><strong>{item.name}</strong>{kind === 'characters' && work?.characterId === item.id && <span className="chip selected">使用中</span>}</div>
        {item.prompt && <p className="small prompt-text">{item.prompt}</p>}
        {item.negative && <p className="muted small prompt-text">ネガティブ：{item.negative}</p>}
        {item.memo && <p className="muted small">{item.memo}</p>}
        {kind === 'templates' ? templateConfirm === item.id ? <div className="stack"><p className="small">ページのプロンプト・ネガティブ・メモと直接編集を置き換えますか？</p><div className="row"><button className="primary" onClick={() => { apply(item); setTemplateConfirm(''); }}>適用する</button><button onClick={() => setTemplateConfirm('')}>キャンセル</button></div></div> : <button className="secondary" onClick={() => setTemplateConfirm(item.id)}>現在のページに適用</button> : <button className="secondary" onClick={() => apply(item)}>{kind === 'characters' ? '現在の作品で使用' : '現在のページに追加'}</button>}
        <details className="accordion"><summary>{item.name}を編集</summary><div className="stack">
          <Field label="名前"><input aria-label={`${item.name}の名前`} value={item.name} onChange={event => update(item.id, { name: event.target.value })} /></Field>
          <Field label="プロンプト"><textarea aria-label={`${item.name}のプロンプト`} value={item.prompt} rows={3} onChange={event => update(item.id, { prompt: event.target.value })} /></Field>
          <Field label="ネガティブプロンプト"><textarea aria-label={`${item.name}のネガティブプロンプト`} value={item.negative} rows={2} onChange={event => update(item.id, { negative: event.target.value })} /></Field>
          <Field label="メモ"><textarea aria-label={`${item.name}のメモ`} value={item.memo} rows={2} onChange={event => update(item.id, { memo: event.target.value })} /></Field>
          <p className="muted small">変更は自動保存されます。{kind === 'characters' ? '使用中の作品へ変更が反映されます。' : 'すでに適用したページの内容は保持されます。'}</p>
          <ConfirmButton className="danger" onConfirm={() => remove(item.id)}>この{LABELS[kind]}を削除</ConfirmButton>
        </div></details>
      </article>)}
      {!data[kind].length && <Empty title={`${LABELS[kind]}を保存しましょう`}>下のフォームで、繰り返し使う設定を登録できます。</Empty>}
    </div>
    <section className="card stack">
      <h2>＋ {LABELS[kind]}を登録</h2>
      {kind !== 'characters' && <button type="button" className="secondary" onClick={saveCurrent}>現在のページから読み込む</button>}
      <form className="stack" onSubmit={add}>
        <Field label="名前"><input aria-label={`新しい${LABELS[kind]}の名前`} required value={name} onChange={event => setName(event.target.value)} placeholder={kind === 'characters' ? 'キャラクター名' : kind === 'templates' ? '例：顔アップ' : '例：夜の室内'} /></Field>
        <Field label="プロンプト"><textarea aria-label={`新しい${LABELS[kind]}のプロンプト`} rows={3} value={prompt} onChange={event => setPrompt(event.target.value)} /></Field>
        <Field label="ネガティブプロンプト"><textarea aria-label={`新しい${LABELS[kind]}のネガティブプロンプト`} rows={2} value={negative} onChange={event => setNegative(event.target.value)} /></Field>
        <Field label="メモ"><textarea aria-label={`新しい${LABELS[kind]}のメモ`} rows={2} value={memo} onChange={event => setMemo(event.target.value)} /></Field>
        <button className="primary" type="submit">{LABELS[kind]}を保存</button>
      </form>
    </section>
  </div>;
}
