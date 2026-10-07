import { createStore } from './store.js';
import { addSelection, removeSelection, setSelectionWeight, moveSelection, editText, renderSelection, isValidWeight, parseBulk } from './prompt-text.js';

const store = createStore();
const app = document.getElementById('app');
const overlays = document.getElementById('overlay-root');
const toastNode = document.getElementById('toast');
const ui = {
  page: 'create', queries: {create: '', dictionary: ''}, categories: {create: 'all', dictionary: 'all'},
  filter: 'all', limit: 80, composerOpen: true, modal: null, composing: false, pendingInput: null,
  toastTimer: null, draftError: '', lastFocus: null
};
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const attr = esc;
const id = () => globalThis.crypto?.randomUUID?.() || ('pp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
const snap = () => store.getSnapshot();
const button = (action, label, extra = '', className = 'button') => '<button type="button" class="' + className + '" data-action="' + action + '" ' + extra + '>' + label + '</button>';
const date = (value) => {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString('ja-JP', {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'}) : '日時不明';
};
function toast(message) {
  clearTimeout(ui.toastTimer);
  toastNode.textContent = String(message);
  toastNode.classList.add('is-visible');
  ui.toastTimer = setTimeout(() => toastNode.classList.remove('is-visible'), 2600);
}
function report(result, success) {
  if (!result || result.ok === false) {
    const message = result?.error || '処理できませんでした。';
    if (ui.modal) {
      const node = overlays.querySelector('.form-error');
      if (node) { node.textContent = message; node.hidden = false; }
    }
    toast(message);
    return false;
  }
  if (result.notice) toast((success ? success + '。' : '') + result.notice);
  else if (success) toast(success);
  return true;
}
function writeDraft(draft) {
  const result = store.setDraft(draft);
  if (!result.ok && ui.draftError !== result.error) { ui.draftError = result.error; toast(result.error); }
  if (result.ok) ui.draftError = '';
  return result;
}
function categoryName(categoryId) {
  return snap().data?.categories.find((category) => category.id === categoryId)?.name || 'その他';
}
function safeImage(source) {
  return typeof source === 'string' && /^(https?:\/\/|data:image\/(?:png|jpeg|webp|gif);base64,)/i.test(source) ? source : '';
}

app.innerHTML = '<div class="app-shell"><header class="app-header"><div><h1>Prompt Pocket</h1><p class="header-subtitle">タップで組み合わせて、すぐコピー。</p></div>' +
  button('add-item', '＋ 登録', 'aria-label="プロンプトを登録"', 'button header-add') +
  '</header><main class="page-main has-composer" id="main"></main>' +
  '<section class="composer-dock" id="composer" aria-label="完成プロンプト"><div class="composer-summary">' +
  '<button type="button" class="composer-toggle" data-action="toggle-composer" aria-expanded="true" aria-controls="composer-body"><strong>完成プロンプト</strong> <span id="selection-count"></span> <span id="composer-chevron">⌄</span></button>' +
  button('clear-draft', '全解除', 'aria-label="選択と完成プロンプトを全解除"', 'button subtle') +
  '</div><div class="composer-body" id="composer-body"><div class="composer-selection-region" id="selected-region"></div>' +
  '<label class="sr-only" for="prompt-text">完成プロンプトを直接編集</label><textarea id="prompt-text" class="composer-text" rows="3" placeholder="候補をタップ。またはここに直接入力…" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>' +
  '<div class="composer-actions">' + button('save-preset', '組み合わせを保存', '', 'button subtle') + '<small id="draft-status" class="muted"></small></div></div>' +
  '<button type="button" class="copy-button" data-action="copy">完成プロンプトをコピー</button></section>' +
  '<nav class="bottom-nav" aria-label="メインナビゲーション">' +
  [['create','＋','作成'],['dictionary','▤','辞書'],['presets','◇','プリセット'],['history','◷','履歴'],['settings','⚙','設定']].map(([page,icon,label]) =>
    '<button type="button" class="nav-item" data-action="navigate" data-page="' + page + '"><span aria-hidden="true">' + icon + '</span><span>' + label + '</span></button>').join('') +
  '</nav></div>';

const main = document.getElementById('main');
const composer = document.getElementById('composer');
const textArea = document.getElementById('prompt-text');
function preserveMainFocus(renderBody) {
  const active = document.activeElement;
  const focus = main.contains(active) && active.id ? {id:active.id, start:active.selectionStart, end:active.selectionEnd} : null;
  const categoryScroll = main.querySelector('.category-row')?.scrollLeft || 0;
  renderBody();
  const row = main.querySelector('.category-row');
  if (row) row.scrollLeft = categoryScroll;
  if (focus) {
    const target = document.getElementById(focus.id);
    if (target) {
      target.focus({preventScroll:true});
      if (typeof target.setSelectionRange === 'function' && typeof focus.start === 'number') {
        try { target.setSelectionRange(focus.start, focus.end); } catch {}
      }
    }
  }
}
function render() {
  const state = snap();
  const isCreate = ui.page === 'create';
  main.classList.toggle('has-composer', isCreate);
  composer.hidden = !isCreate || !state.data || state.status.phase === 'error';
  for (const nav of app.querySelectorAll('[data-action="navigate"]')) {
    const active = nav.dataset.page === ui.page;
    nav.classList.toggle('is-active', active);
    if (active) nav.setAttribute('aria-current', 'page'); else nav.removeAttribute('aria-current');
  }
  app.querySelector('.header-add').hidden = !state.data || state.status.phase === 'error' || !['create','dictionary'].includes(ui.page);
  preserveMainFocus(() => {
    if (state.status.phase === 'loading') {
      main.innerHTML = '<section class="page"><div class="empty-state">保存データを読み込んでいます…</div></section>';
    } else if (!state.data || state.status.phase === 'error') {
      main.innerHTML = renderStorageError(state);
    } else {
      main.innerHTML = '<section class="page">' + renderNotice(state) +
        ({create: renderCreate, dictionary: renderDictionary, presets: renderPresets, history: renderHistory, settings: renderSettings}[ui.page] || renderCreate)() + '</section>';
    }
  });
  renderComposer(state);
  updateComposerHeight();
}
function renderNotice(state) {
  if (state.persisted && !state.status.notice && !state.status.message) return '';
  const message = !state.persisted ? '保存できていない変更があります。設定からバックアップできます。' : (state.status.notice || state.status.message);
  return '<div class="status-banner" role="status">' + esc(message) + '</div>';
}
function renderStorageError(state) {
  return '<section class="page"><div class="panel"><h2>保存データを読み込めませんでした</h2><p>' + esc(state.status.message || state.status.notice || '元のデータを保持しています。') +
    '</p><p class="muted">まず保存データを書き出し、バックアップから復元してください。</p><div class="toolbar">' +
    button('raw-export', '保存データを書き出す') + button('retry', 'もう一度読み込む') + button('restore-recovery', '置換前のデータに戻す') +
    button('choose-backup', 'バックアップを読み込む') + button('start-fresh', '控えを残して初期化', '', 'button danger') +
    '</div><input type="file" id="backup-file" accept=".json,application/json" hidden></div></section>';
}
function filteredItems(page) {
  const data = snap().data;
  const query = ui.queries[page].trim().toLocaleLowerCase();
  let items = data.items.filter((item) => {
    if (query) {
      if (!(item.label + '\n' + item.prompt + '\n' + (item.note || '')).toLocaleLowerCase().includes(query)) return false;
    } else if (ui.categories[page] !== 'all' && item.categoryId !== ui.categories[page]) return false;
    if (page === 'create' && ui.filter === 'favorite' && !item.favorite) return false;
    if (page === 'create' && ui.filter === 'recent' && !item.lastUsedAt) return false;
    return true;
  });
  const sort = data.settings.sort;
  if (page === 'create' && ui.filter === 'recent') items.sort((a,b) => Number(b.lastUsedAt || 0) - Number(a.lastUsedAt || 0));
  else if (sort === 'usage') items.sort((a,b) => (b.usageCount || 0) - (a.usageCount || 0));
  else if (sort === 'name') items.sort((a,b) => a.label.localeCompare(b.label, 'ja'));
  return items;
}
function searchAndCategories(page) {
  const query = ui.queries[page];
  return '<div class="search-field"><span aria-hidden="true">⌕</span><label class="sr-only" for="search-input">日本語・英語で辞書全体を検索</label>' +
    '<input id="search-input" type="search" value="' + attr(query) + '" placeholder="日本語・英語で辞書を検索" autocomplete="off" autocapitalize="off">' +
    (query ? button('clear-search', '×', 'aria-label="検索をクリア"', 'icon-button') : '') + '</div>' +
    '<div class="category-row" role="group" aria-label="カテゴリ">' +
    button('category', 'すべて', 'data-id="all" aria-pressed="' + (ui.categories[page] === 'all') + '"', 'filter-chip' + (ui.categories[page] === 'all' ? ' is-active' : '')) +
    snap().data.categories.map((category) => button('category', esc(category.emoji ? category.emoji + ' ' : '') + esc(category.name),
      'data-id="' + attr(category.id) + '" aria-pressed="' + (ui.categories[page] === category.id) + '"', 'filter-chip' + (ui.categories[page] === category.id ? ' is-active' : ''))).join('') +
    '</div>' + (query ? '<p class="muted search-note">全カテゴリから検索しています</p>' : '');
}
function sortControl() {
  const sort = snap().data.settings.sort;
  return '<label class="sort-control"><span class="sr-only">表示順</span><select id="sort-select" aria-label="表示順">' +
    [['default','登録順'],['usage','使用回数順'],['name','名前順']].map(([value,label]) => '<option value="' + value + '"' + (sort === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label>';
}
function renderCreate() {
  const items = filteredItems('create');
  const selected = new Set(snap().draft.selections.map((selection) => selection.itemId));
  return searchAndCategories('create') + '<div class="filter-row">' +
    [['all','すべて'],['favorite','★ お気に入り'],['recent','◷ 最近使用']].map(([value,label]) => button('filter', label,
      'data-filter="' + value + '" aria-pressed="' + (ui.filter === value) + '"', 'filter-chip' + (ui.filter === value ? ' is-active' : ''))).join('') + '</div>' +
    '<div class="section-heading"><span class="muted">' + items.length + '件</span>' + sortControl() + '</div>' +
    (items.length ? '<div class="prompt-grid">' + items.slice(0, ui.limit).map((item) => {
      const image = snap().data.settings.showImages && safeImage(item.image);
      return '<div class="prompt-card"><button type="button" class="prompt-chip' + (selected.has(item.id) ? ' is-selected' : '') + '" data-action="toggle-item" data-id="' + attr(item.id) +
        '" aria-pressed="' + selected.has(item.id) + '">' + (image ? '<img class="chip-image" src="' + attr(image) + '" alt="" loading="lazy">' : '') +
        '<span class="chip-label">' + esc(item.label) + '</span><span class="chip-prompt">' + esc(item.prompt) +
        '</span><span class="chip-meta">' + esc(categoryName(item.categoryId)) + (item.usageCount ? ' · ' + item.usageCount + '回' : '') + '</span></button>' +
        button('favorite', item.favorite ? '★' : '☆', 'data-id="' + attr(item.id) + '" aria-label="' + attr(item.label + (item.favorite ? 'のお気に入りを解除' : 'をお気に入りに登録')) + '" aria-pressed="' + item.favorite + '"', 'icon-button favorite-toggle' + (item.favorite ? ' is-favorite' : '')) + '</div>';
    }).join('') + '</div>' + moreButton(items.length) : '<div class="empty-state">' +
      (ui.filter === 'recent' ? '選択したプロンプトがここに並びます。' : ui.filter === 'favorite' ? '☆をタップすると、よく使う語をまとめられます。' : '該当するプロンプトがありません。検索やカテゴリを変えるか、登録してください。') + '</div>');
}
function moreButton(total) {
  return total > ui.limit ? '<div class="load-more">' + button('show-more', 'さらに表示（残り' + (total - ui.limit) + '件）') + '</div>' : '';
}
function renderDictionary() {
  const items = filteredItems('dictionary');
  return '<div class="section-heading"><h2>辞書</h2><div class="toolbar">' + button('bulk-add', '一括登録') + button('categories', 'カテゴリ') + '</div></div>' +
    searchAndCategories('dictionary') + '<div class="section-heading"><span class="muted">' + items.length + '件</span>' + sortControl() + '</div>' +
    (items.length ? '<div class="dictionary-list">' + items.slice(0, ui.limit).map((item) => '<article class="card dictionary-item"><div class="item-copy"><strong>' + esc(item.label) +
      '</strong><p class="chip-prompt">' + esc(item.prompt) + '</p><small class="muted">' + esc(categoryName(item.categoryId)) + ' · ' + item.usageCount + '回使用</small>' +
      (item.note ? '<p class="item-note">' + esc(item.note) + '</p>' : '') + '</div><div class="item-actions">' +
      button('favorite', item.favorite ? '★' : '☆', 'data-id="' + attr(item.id) + '" aria-label="' + attr(item.label + 'のお気に入りを切り替え') + '" aria-pressed="' + item.favorite + '"', 'icon-button' + (item.favorite ? ' is-favorite' : '')) +
      button('edit-item', '編集', 'data-id="' + attr(item.id) + '"', 'button subtle') + '</div></article>').join('') + '</div>' + moreButton(items.length) :
      '<div class="empty-state">登録されているプロンプトがありません。<div class="toolbar">' + button('add-item', '＋ 登録') + button('bulk-add', 'まとめて登録') + '</div></div>');
}
function renderPresets() {
  const presets = snap().data.presets;
  return '<div class="section-heading"><h2>プリセット</h2>' + button('save-preset', '＋ 現在の組み合わせ') + '</div><p class="muted">完成文と重み・選択状態をまとめて保存します。</p>' +
    (presets.length ? presets.map((preset) => '<article class="card"><div class="section-heading"><h3>' + esc(preset.name) + '</h3><small class="muted">' + date(preset.updatedAt) + '</small></div>' +
      '<p class="text-preview">' + esc(preset.text) + '</p><div class="toolbar">' + button('load-preset', '読み込む', 'data-id="' + attr(preset.id) + '"', 'button primary') +
      button('rename-preset', '名前変更', 'data-id="' + attr(preset.id) + '"') + button('delete-preset', '削除', 'data-id="' + attr(preset.id) + '"', 'button danger subtle') + '</div></article>').join('') :
      '<div class="empty-state">作成画面で組み合わせを作り、「組み合わせを保存」から登録できます。</div>');
}
function renderHistory() {
  const history = snap().data.history;
  return '<div class="section-heading"><h2>履歴</h2>' + (history.length ? button('clear-history', '履歴を削除', '', 'button danger subtle') : '') +
    '</div><p class="muted">コピーに成功した完成プロンプトを、直近100件まで保存します。</p>' +
    (history.length ? history.map((entry) => '<article class="card"><div class="section-heading"><strong>' + date(entry.copiedAt) + '</strong><span class="muted">' + entry.text.length +
      '文字</span></div><p class="text-preview">' + esc(entry.text) + '</p><div class="toolbar">' + button('load-history', '読み込む', 'data-id="' + attr(entry.id) + '"', 'button primary') +
      button('delete-history', '削除', 'data-id="' + attr(entry.id) + '"', 'button danger subtle') + '</div></article>').join('') :
      '<div class="empty-state">完成プロンプトをコピーすると、ここから再利用できます。</div>');
}
function renderSettings() {
  const state = snap();
  const data = state.data;
  return '<h2>設定とバックアップ</h2><div class="panel"><h3>ブラウザ内の保存</h3><p class="storage-status">' +
    (state.persisted && state.draftPersisted ? '✓ 変更と作成途中の内容は保存済みです。' : '保存されていない変更があります。バックアップを書き出してください。') +
    '</p><p class="muted">同じ端末・ブラウザ・URLで再び開くとデータが残ります。別の端末へはバックアップで移せます。</p>' +
    '<p class="muted">辞書 ' + data.items.length + '件 / カテゴリ ' + data.categories.length + '件 / プリセット ' + data.presets.length + '件 / 履歴 ' + data.history.length + '件</p></div>' +
    '<div class="panel"><h3>表示</h3><label class="inline-checkbox"><input type="checkbox" id="show-images"' + (data.settings.showImages ? ' checked' : '') +
    '> 参考画像を表示する</label><div class="field"><label for="settings-sort">プロンプトの表示順</label><select id="settings-sort">' +
    [['default','登録順'],['usage','使用回数順'],['name','名前順']].map(([value,label]) => '<option value="' + value + '"' + (data.settings.sort === value ? ' selected' : '') + '>' + label + '</option>').join('') +
    '</select></div></div><div class="panel"><h3>バックアップ</h3><p class="muted">辞書・画像・プリセット・履歴・設定・作成途中の内容をJSONで保存できます。</p><div class="toolbar">' +
    button('export-backup', 'バックアップを書き出す', '', 'button primary') + button('choose-backup', 'バックアップを読み込む') +
    '</div><input type="file" id="backup-file" accept=".json,application/json" hidden><div class="toolbar">' +
    button('restore-recovery', '置換前のデータに戻す', '', 'button subtle') + button('raw-export', '保存データをそのまま書き出す', '', 'button subtle') +
    '</div></div><div class="panel"><h3>保存の再確認</h3><p class="muted">読み直すと、保存されていない変更は失われます。必要なら先にバックアップしてください。</p>' +
    button('retry', '保存データを読み直す') + '</div>';
}
function renderComposer(state) {
  if (!state.draft) return;
  const selections = state.draft.selections || [];
  document.getElementById('selection-count').textContent = selections.length ? selections.length + '語 / ' + state.draft.text.length + '文字' : state.draft.text.length + '文字';
  document.getElementById('composer-body').hidden = !ui.composerOpen;
  document.getElementById('composer-chevron').textContent = ui.composerOpen ? '⌄' : '⌃';
  app.querySelector('.composer-toggle').setAttribute('aria-expanded', String(ui.composerOpen));
  app.querySelector('[data-action="copy"]').disabled = !state.draft.text.trim();
  app.querySelector('[data-action="save-preset"]').disabled = !state.draft.text.trim();
  app.querySelector('[data-action="clear-draft"]').disabled = !state.draft.text && !selections.length;
  document.getElementById('draft-status').textContent = state.draftPersisted ? '保存済み' : '未保存';
  if (textArea.value !== state.draft.text) textArea.value = state.draft.text;
  document.getElementById('selected-region').innerHTML = selections.length ? '<div class="selected-list" aria-label="選択中のプロンプト">' +
    selections.map((selection,index) => '<div class="selected-item"><div class="selected-content"><span class="selected-title">' + esc(selection.label) +
      '</span><span class="selected-prompt">' + esc(renderSelection(selection)) + '</span></div><div class="selected-actions">' +
      button('move-selection', '↑', 'data-key="' + attr(selection.key) + '" data-direction="-1" aria-label="' + attr(selection.label + 'を前へ移動') + '"' + (index === 0 ? ' disabled' : ''), 'icon-button') +
      button('move-selection', '↓', 'data-key="' + attr(selection.key) + '" data-direction="1" aria-label="' + attr(selection.label + 'を後ろへ移動') + '"' + (index === selections.length - 1 ? ' disabled' : ''), 'icon-button') +
      button('weight', '×' + esc(selection.weight), 'data-key="' + attr(selection.key) + '" aria-label="' + attr(selection.label + 'の重みを変更') + '"', 'button weight-button') +
      button('remove-selection', '×', 'data-key="' + attr(selection.key) + '" aria-label="' + attr(selection.label + 'の選択を解除') + '"', 'icon-button') +
      '</div></div>').join('') + '</div>' : '';
}
function updateComposerHeight() {
  const height = composer.hidden ? 0 : composer.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--composer-height', height + 'px');
}
if (globalThis.ResizeObserver) new ResizeObserver(updateComposerHeight).observe(composer);
window.addEventListener('resize', updateComposerHeight);

function closeModal() {
  const focus = ui.modal ? ui.lastFocus : null;
  ui.lastFocus = null;
  ui.modal = null;
  overlays.innerHTML = '';
  document.body.classList.remove('modal-open');
  if (focus?.isConnected) focus.focus({preventScroll:true});
}
function openModal(title, body, options = {}) {
  if (!ui.modal) ui.lastFocus = document.activeElement;
  ui.modal = options;
  overlays.innerHTML = '<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title">' +
    esc(title) + '</h2>' + button('close-modal', '×', 'aria-label="閉じる"', 'icon-button') + '</div><form id="modal-form"><div class="modal-body">' + body +
    '<p class="form-error notice" role="alert" hidden></p></div>' + (options.submitLabel ? '<div class="modal-footer">' + button('close-modal', 'キャンセル') +
      '<button type="submit" class="button primary">' + esc(options.submitLabel) + '</button></div>' : '') + '</form></section></div>';
  document.body.classList.add('modal-open');
  const form = document.getElementById('modal-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (ui.modal?.onSubmit) ui.modal.onSubmit(new FormData(form), form);
  });
  if (options.onMount) options.onMount(form);
  requestAnimationFrame(() => {
    const focus = overlays.querySelector('[autofocus]') || overlays.querySelector('input:not([type="file"]), textarea, select, button');
    focus?.focus({preventScroll:true});
  });
}
function confirmAction(title, message, action, label = '実行する') {
  openModal(title, '<p>' + esc(message) + '</p>', {submitLabel: label, onSubmit: () => {
    const result = action();
    if (result?.then) result.catch((error) => toast(error.message || '処理できませんでした。'));
  }});
}
function categoryOptions(value) {
  return snap().data.categories.map((category) => '<option value="' + attr(category.id) + '"' + (category.id === value ? ' selected' : '') + '>' +
    esc(category.emoji ? category.emoji + ' ' : '') + esc(category.name) + '</option>').join('');
}
function openItem(itemId) {
  const item = snap().data.items.find((entry) => entry.id === itemId);
  if (itemId && !item) return toast('この項目は見つかりませんでした。');
  const currentCategory = ui.categories[ui.page] !== 'all' ? ui.categories[ui.page] : snap().data.categories[0]?.id;
  let imageValue = item?.image || null;
  let imageBusy = false;
  const imagePreview = () => {
    const node = document.getElementById('item-image-preview');
    if (node) node.innerHTML = safeImage(imageValue) ? '<img src="' + attr(safeImage(imageValue)) + '" alt="登録する参考画像" class="image-preview">' : '<span class="muted">参考画像なし</span>';
  };
  openModal(item ? 'プロンプトを編集' : 'プロンプトを登録',
    '<div class="field"><label for="item-label">表示名</label><input id="item-label" name="label" value="' + attr(item?.label || '') + '" required maxlength="200" autofocus placeholder="例：長い髪"></div>' +
    '<div class="field"><label for="item-prompt">出力するプロンプト</label><textarea id="item-prompt" name="prompt" required rows="3" spellcheck="false" autocapitalize="off" placeholder="例：long hair">' + esc(item?.prompt || '') + '</textarea></div>' +
    '<div class="field"><label for="item-category">カテゴリ</label><select id="item-category" name="categoryId">' + categoryOptions(item?.categoryId || currentCategory) + '</select></div>' +
    '<label class="inline-checkbox"><input type="checkbox" name="favorite"' + (item?.favorite ? ' checked' : '') + '> お気に入り</label>' +
    '<div class="field"><label for="item-note">メモ</label><textarea id="item-note" name="note" rows="2" placeholder="使い方や注意点（任意）">' + esc(item?.note || '') + '</textarea></div>' +
    '<div class="field"><label for="item-image">参考画像（任意）</label><input type="file" id="item-image" accept="image/*"><small class="muted">長辺512pxに縮小して保存します。</small><div id="item-image-preview"></div>' +
    button('clear-image', '画像を外す', '', 'button subtle') + '</div>' +
    (item ? '<div class="toolbar">' + button('delete-item', 'この項目を削除', 'data-id="' + attr(item.id) + '"', 'button danger') + '</div>' : ''),
    {submitLabel:item ? '保存する' : '登録する', onSubmit: (formData) => {
      if (imageBusy) return toast('画像を処理しています。少しお待ちください。');
      const fields = {label:String(formData.get('label') || '').trim(), prompt:String(formData.get('prompt') || '').trim(), categoryId:String(formData.get('categoryId') || ''),
        favorite:formData.get('favorite') === 'on', note:String(formData.get('note') || '').trim(), image:imageValue};
      if (!fields.label || !fields.prompt) return toast('表示名とプロンプトを入力してください。');
      if (report(store.saveItem(fields, item?.id), item ? '保存しました' : '登録しました')) closeModal();
    }, onMount:(form) => {
      imagePreview();
      form.querySelector('[data-action="clear-image"]').addEventListener('click', () => { imageValue = null; imagePreview(); });
      form.querySelector('#item-image').addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        imageBusy = true;
        try { const compressed = await compressImage(file); if (!form.isConnected) return; imageValue = compressed; imagePreview(); } catch (error) { toast(error.message || '画像を読み込めませんでした。'); }
        finally { imageBusy = false; }
      });
    }});
}
async function compressImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選んでください。');
  if (file.size > 20 * 1024 * 1024) throw new Error('画像は20MB以内にしてください。');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve,reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('この画像形式は読み込めませんでした。'));
      img.src = url;
    });
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('画像を処理できませんでした。');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  } finally { URL.revokeObjectURL(url); }
}
function openBulk() {
  const category = ui.categories[ui.page] !== 'all' ? ui.categories[ui.page] : snap().data.categories[0]?.id;
  openModal('プロンプトを一括登録',
    '<p class="muted">1行に1件。空行は無視します。「表示名［Tab］英語プロンプト」でも登録できます。</p><div class="field"><label for="bulk-category">登録先カテゴリ</label><select name="categoryId" id="bulk-category">' +
    categoryOptions(category) + '</select></div><div class="field"><label for="bulk-lines">プロンプト一覧</label><textarea id="bulk-lines" name="lines" rows="9" spellcheck="false" autocapitalize="off" required autofocus placeholder="long hair&#10;short hair&#10;ponytail&#10;twintails"></textarea></div>' +
    '<p id="bulk-count" class="muted" role="status">0件を登録</p>',
    {submitLabel:'まとめて登録', onMount:(form) => {
      form.querySelector('#bulk-lines').addEventListener('input', (event) => {
        const parsed = parseBulk(event.target.value);
        const entries = Array.isArray(parsed) ? parsed : (parsed.items || parsed.entries || []);
        form.querySelector('#bulk-count').textContent = entries.length + '件を登録';
      });
    }, onSubmit:(formData) => {
      const lines = String(formData.get('lines') || '');
      if (!lines.trim()) return toast('登録するプロンプトを入力してください。');
      if (report(store.addItems(lines, String(formData.get('categoryId'))), 'まとめて登録しました')) closeModal();
    }});
}
function openCategories() {
  const categories = snap().data.categories;
  openModal('カテゴリ管理', '<p class="muted">削除したカテゴリの項目は「その他」に移します。</p><div class="toolbar">' +
    button('new-category', '＋ カテゴリを追加', '', 'button primary') + '</div><div class="category-manager">' +
    categories.map((category,index) => '<div class="selected-item"><div class="selected-content"><strong>' + esc(category.emoji ? category.emoji + ' ' : '') + esc(category.name) +
      '</strong><small class="muted">' + snap().data.items.filter((item) => item.categoryId === category.id).length + '件</small></div><div class="selected-actions">' +
      button('move-category', '↑', 'data-id="' + attr(category.id) + '" data-direction="-1" aria-label="' + attr(category.name + 'を前へ移動') + '"' + (index === 0 ? ' disabled' : ''), 'icon-button') +
      button('move-category', '↓', 'data-id="' + attr(category.id) + '" data-direction="1" aria-label="' + attr(category.name + 'を後ろへ移動') + '"' + (index === categories.length-1 ? ' disabled' : ''), 'icon-button') +
      button('edit-category', '編集', 'data-id="' + attr(category.id) + '"', 'button subtle') +
      (category.id !== 'other' ? button('delete-category', '×', 'data-id="' + attr(category.id) + '" aria-label="' + attr(category.name + 'を削除') + '"', 'icon-button danger') : '') +
      '</div></div>').join('') + '</div>');
}
function openCategory(categoryId) {
  const category = snap().data.categories.find((entry) => entry.id === categoryId);
  openModal(category ? 'カテゴリを編集' : 'カテゴリを追加',
    '<div class="field"><label for="category-name">カテゴリ名</label><input name="name" id="category-name" value="' + attr(category?.name || '') +
    '" maxlength="100" required autofocus placeholder="例：髪型"></div><div class="field"><label for="category-emoji">アイコン（任意）</label><input name="emoji" id="category-emoji" value="' +
    attr(category?.emoji || '') + '" maxlength="16" placeholder="例：💇"></div>', {submitLabel:'保存する', onSubmit:(formData) => {
      const fields = {name:String(formData.get('name') || '').trim(), emoji:String(formData.get('emoji') || '').trim()};
      if (!fields.name) return toast('カテゴリ名を入力してください。');
      if (report(store.saveCategory(fields, category?.id), 'カテゴリを保存しました')) openCategories();
    }});
}
function openWeight(key) {
  const selection = snap().draft.selections.find((entry) => entry.key === key);
  if (!selection) return;
  openModal('重みを変更', '<p><strong>' + esc(selection.label) + '</strong></p><p class="muted">1.0で通常の出力。それ以外は（プロンプト:重み）の形式になります。</p>' +
    '<div class="weight-options">' + [0.8,0.9,1,1.1,1.2,1.3,1.4,1.5].map((weight) => button('weight-preset', weight.toFixed(1), 'data-weight="' + weight + '"', 'filter-chip' +
      (selection.weight === weight ? ' is-active' : ''))).join('') + '</div><div class="field"><label for="weight-value">重みを入力（0より大きく、10以下）</label>' +
    '<input type="number" name="weight" id="weight-value" inputmode="decimal" min="0" max="10" step="any" value="' + attr(selection.weight) + '" required></div>',
    {submitLabel:'重みを適用', onSubmit:(formData) => {
      const raw = String(formData.get('weight') || '').trim();
      const value = Number(raw);
      if (!raw || !isValidWeight(value) || value > 10) return toast('0より大きく10以下の重みを入力してください。');
      const next = setSelectionWeight(snap().draft, key, value);
      writeDraft(next);
      closeModal();
    }, onMount:(form) => {
      form.querySelectorAll('[data-action="weight-preset"]').forEach((node) => node.addEventListener('click', () => {
        const value = Number(node.dataset.weight);
        writeDraft(setSelectionWeight(snap().draft, key, value));
        closeModal();
      }));
    }});
}
function openPreset(presetId) {
  const preset = snap().data.presets.find((entry) => entry.id === presetId);
  if (!preset && !snap().draft.text.trim()) return toast('先に完成プロンプトを作成してください。');
  openModal(preset ? 'プリセットの名前を変更' : '組み合わせを保存', '<div class="field"><label for="preset-name">プリセット名</label><input name="name" id="preset-name" maxlength="200" value="' +
    attr(preset?.name || '') + '" required autofocus placeholder="例：アニメ高品質"></div>' +
    '<p class="text-preview">' + esc(preset?.text || snap().draft.text) + '</p>', {submitLabel:'保存する', onSubmit:(formData) => {
      const name = String(formData.get('name') || '').trim();
      if (!name) return toast('プリセット名を入力してください。');
      if (report(store.savePreset(name, preset?.id), 'プリセットを保存しました')) closeModal();
    }});
}
function requestLoad(kind, entryId) {
  const entries = kind === 'preset' ? snap().data.presets : snap().data.history;
  const entry = entries.find((value) => value.id === entryId);
  if (!entry) return toast('読み込むデータが見つかりませんでした。');
  const load = () => {
    const result = kind === 'preset' ? store.loadPreset(entryId) : store.loadHistory(entryId);
    if (report(result, '作成画面に読み込みました')) { closeModal(); ui.page = 'create'; render(); window.scrollTo({top:0,behavior:'smooth'}); }
  };
  if (snap().draft.text.trim() && snap().draft.text !== entry.text) confirmAction('現在の完成文を置き換えますか？', '必要な内容は、先にプリセットとして保存してください。', load, '読み込む');
  else load();
}
function downloadText(text, filename) {
  const url = URL.createObjectURL(new Blob([text], {type:'application/json;charset=utf-8'}));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
function exportBackup(raw = false) {
  const result = raw ? store.rawSavedData() : store.exportBackup();
  if (!report(result)) return;
  downloadText(result.text, 'prompt-pocket-' + (raw ? 'raw-' : 'backup-') + new Date().toISOString().slice(0,10) + '.json');
  toast('バックアップをダウンロードします');
}
async function readBackup(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) return toast('バックアップは20MB以内にしてください。');
  try {
    const text = await file.text();
    const result = store.inspectBackup(text);
    if (!report(result)) return;
    const counts = result.counts;
    openModal('バックアップの内容を確認', '<p>現在のデータを置き換えます。置換前のデータは復旧用に控えを保存します。</p>' +
      (result.legacy ? '<p class="notice">旧Prompt Builder形式を新しい形式へ移行します。</p>' : '') +
      '<div class="backup-counts"><p>辞書：' + counts.items + '件</p><p>カテゴリ：' + counts.categories + '件</p><p>プリセット：' + counts.presets + '件</p><p>履歴：' + counts.history + '件</p></div>' +
      '<p class="muted">未保存の変更も置き換わります。必要なら先にバックアップを書き出してください。</p>',
      {submitLabel:'この内容で置き換える', onSubmit:() => {
        if (report(store.importBackup(text), 'バックアップを読み込みました')) { closeModal(); ui.categories = {create:'all',dictionary:'all'}; render(); }
      }});
  } catch (error) { toast(error.message || 'ファイルを読み込めませんでした。'); }
}
async function copyPrompt() {
  const draft = structuredClone(snap().draft);
  if (!draft.text.trim()) return;
  let copied = false;
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(draft.text); copied = true; }
  } catch {}
  if (!copied) {
    const active = document.activeElement;
    const position = active === textArea ? {start:textArea.selectionStart,end:textArea.selectionEnd} : null;
    const helper = document.createElement('textarea');
    helper.value = draft.text;
    helper.setAttribute('readonly','');
    helper.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.append(helper); helper.focus(); helper.select(); helper.setSelectionRange(0,helper.value.length);
    try { copied = document.execCommand('copy'); } catch {}
    helper.remove();
    if (active?.isConnected) { active.focus({preventScroll:true}); if (position) textArea.setSelectionRange(position.start,position.end); }
  }
  if (!copied) {
    ui.composerOpen = true; renderComposer(snap()); textArea.focus(); textArea.select();
    toast('コピーできませんでした。完成文を選択しました。手動でコピーしてください。');
    return;
  }
  toast('コピーしました');
  const result = store.recordHistory(draft);
  if (!result.ok) toast('コピーしました。履歴の保存に失敗しました：' + result.error);
}
const actions = {
  'navigate': (node) => { ui.page = node.dataset.page; ui.limit = 80; closeModal(); render(); main.scrollTop = 0; window.scrollTo({top:0}); },
  'category': (node) => { ui.categories[ui.page] = node.dataset.id; ui.limit = 80; render(); },
  'filter': (node) => { ui.filter = node.dataset.filter; ui.limit = 80; render(); },
  'clear-search': () => { ui.queries[ui.page] = ''; ui.limit = 80; render(); document.getElementById('search-input')?.focus(); },
  'show-more': () => { ui.limit += 100; render(); },
  'toggle-composer': () => { ui.composerOpen = !ui.composerOpen; renderComposer(snap()); updateComposerHeight(); },
  'toggle-item': (node) => {
    if (document.activeElement?.id === 'search-input') document.activeElement.blur();
    const item = snap().data.items.find((entry) => entry.id === node.dataset.id);
    if (!item) return;
    const existing = snap().draft.selections.filter((selection) => selection.itemId === item.id);
    let next = snap().draft;
    if (existing.length) { for (const selection of existing) next = removeSelection(next, selection.key); writeDraft(next); }
    else {
      next = addSelection(next, {key:id(), itemId:item.id, label:item.label, prompt:item.prompt, weight:1});
      writeDraft(next);
      const result = store.recordUse(item.id);
      if (!result.ok) toast(result.error);
    }
  },
  'favorite': (node) => report(store.toggleFavorite(node.dataset.id)),
  'remove-selection': (node) => writeDraft(removeSelection(snap().draft, node.dataset.key)),
  'move-selection': (node) => writeDraft(moveSelection(snap().draft, node.dataset.key, Number(node.dataset.direction))),
  'weight': (node) => openWeight(node.dataset.key),
  'clear-draft': () => confirmAction('完成プロンプトを全解除しますか？', '選択中の項目と手入力の文章を空にします。辞書・プリセット・履歴は残ります。', () => {
    writeDraft({text:'',selections:[]}); textArea.value = ''; closeModal(); toast('選択を解除しました');
  }, '全解除する'),
  'copy': () => copyPrompt().catch(() => toast('コピーできませんでした。')),
  'add-item': () => openItem(),
  'edit-item': (node) => openItem(node.dataset.id),
  'delete-item': (node) => {
    const item = snap().data.items.find((entry) => entry.id === node.dataset.id);
    confirmAction('この項目を削除しますか？', (item?.label || 'この項目') + 'を辞書から削除します。保存済みのプリセットと履歴の文章は残ります。', () => {
      if (report(store.deleteItem(node.dataset.id), '削除しました')) closeModal();
    }, '削除する');
  },
  'bulk-add': () => openBulk(),
  'categories': () => openCategories(),
  'new-category': () => openCategory(),
  'edit-category': (node) => openCategory(node.dataset.id),
  'delete-category': (node) => {
    const category = snap().data.categories.find((entry) => entry.id === node.dataset.id);
    confirmAction('カテゴリを削除しますか？', (category?.name || 'このカテゴリ') + 'の項目は「その他」に移動します。項目自体は削除しません。', () => {
      if (report(store.deleteCategory(node.dataset.id), 'カテゴリを削除しました')) {
        for (const page of ['create','dictionary']) if (ui.categories[page] === node.dataset.id) ui.categories[page] = 'all';
        openCategories(); render();
      }
    }, 'カテゴリを削除');
  },
  'move-category': (node) => { if (report(store.moveCategory(node.dataset.id, Number(node.dataset.direction)))) openCategories(); },
  'save-preset': () => openPreset(),
  'rename-preset': (node) => openPreset(node.dataset.id),
  'load-preset': (node) => requestLoad('preset', node.dataset.id),
  'delete-preset': (node) => confirmAction('プリセットを削除しますか？', 'このプリセットを削除します。辞書と現在の完成文は残ります。', () => {
    if (report(store.deletePreset(node.dataset.id), 'プリセットを削除しました')) closeModal();
  }, '削除する'),
  'load-history': (node) => requestLoad('history', node.dataset.id),
  'delete-history': (node) => confirmAction('この履歴を削除しますか？', '現在の完成文は残ります。', () => {
    if (report(store.deleteHistory(node.dataset.id), '履歴を削除しました')) closeModal();
  }, '削除する'),
  'clear-history': () => confirmAction('履歴をすべて削除しますか？', 'コピー履歴だけを削除します。辞書・プリセット・現在の完成文は残ります。', () => {
    if (report(store.clearHistory(), '履歴を削除しました')) closeModal();
  }, '履歴をすべて削除'),
  'export-backup': () => exportBackup(),
  'raw-export': () => exportBackup(true),
  'choose-backup': () => document.getElementById('backup-file')?.click(),
  'restore-recovery': () => {
    const result = store.readRecovery();
    if (!report(result)) return;
    confirmAction('置換前のデータに戻しますか？', '前回の置換前に保存した辞書・プリセット・履歴・設定・完成文へ戻します。現在の内容は控えに保存します。', () => {
      if (report(store.restoreRecovery(), '置換前のデータに戻しました')) { closeModal(); ui.categories = {create:'all',dictionary:'all'}; render(); }
    }, '元に戻す');
  },
  'retry': () => confirmAction('保存データを読み直しますか？', '保存できていない変更は失われます。必要なら先にバックアップを書き出してください。', () => {
    if (report(store.retry(), '保存データを読み直しました')) closeModal();
  }, '読み直す'),
  'start-fresh': () => confirmAction('控えを残して初期化しますか？', '元の保存データを控えに残して、サンプル入りの辞書で始めます。控えの保存に失敗した場合は初期化しません。', () => {
    if (report(store.startFresh(), '初期データを読み込みました')) closeModal();
  }, '初期化する'),
  'close-modal': () => closeModal()
};
document.addEventListener('click', (event) => {
  const node = event.target.closest('[data-action]');
  if (node && (app.contains(node) || overlays.contains(node))) {
    const action = actions[node.dataset.action];
    if (action && !node.disabled) {
      try { action(node); } catch (error) { console.error(error); toast('処理できませんでした。データを確認してください。'); }
    }
  }
  if (event.target.classList.contains('modal-backdrop')) closeModal();
});
document.addEventListener('keydown', (event) => {
  if (!ui.modal) return;
  if (event.key === 'Escape') { event.preventDefault(); closeModal(); return; }
  if (event.key !== 'Tab') return;
  const nodes = [...overlays.querySelectorAll('button:not(:disabled), input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), select:not(:disabled), a[href]')].filter((node) => node.getClientRects().length);
  if (!nodes.length) { event.preventDefault(); return; }
  const first = nodes[0], last = nodes[nodes.length-1];
  if (event.shiftKey && (document.activeElement === first || !overlays.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || !overlays.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
});
main.addEventListener('compositionstart', (event) => { if (event.target.id === 'search-input') ui.composing = true; });
main.addEventListener('compositionend', (event) => {
  if (event.target.id === 'search-input') { ui.composing = false; ui.queries[ui.page] = event.target.value; ui.limit = 80; render(); }
});
main.addEventListener('input', (event) => {
  if (event.target.id === 'search-input') { ui.queries[ui.page] = event.target.value; ui.limit = 80; if (!ui.composing && !event.isComposing) render(); }
});
main.addEventListener('change', (event) => {
  if (event.target.id === 'sort-select' || event.target.id === 'settings-sort') report(store.updateSettings({sort:event.target.value}));
  else if (event.target.id === 'show-images') report(store.updateSettings({showImages:event.target.checked}));
  else if (event.target.id === 'backup-file') { const file = event.target.files?.[0]; event.target.value = ''; readBackup(file); }
});
textArea.addEventListener('beforeinput', (event) => {
  const start = textArea.selectionStart, end = textArea.selectionEnd;
  if (event.inputType === 'insertText' && typeof event.data === 'string') ui.pendingInput = {start,end,insertedText:event.data};
  else if (event.inputType === 'insertLineBreak') ui.pendingInput = {start,end,insertedText:'\n'};
  else if (event.inputType.startsWith('delete') && start !== end) ui.pendingInput = {start,end,insertedText:''};
  else ui.pendingInput = null;
});
textArea.addEventListener('input', () => {
  const next = editText(snap().draft, textArea.value, ui.pendingInput || undefined);
  ui.pendingInput = null;
  writeDraft(next);
});
textArea.addEventListener('blur', () => { if (textArea.value !== snap().draft.text) textArea.value = snap().draft.text; });
let previousState = snap();
store.subscribe((state) => {
  const onlyDraft = state.data === previousState.data &&
    state.status === previousState.status && state.persisted === previousState.persisted;
  previousState = state;
  if (!onlyDraft) { render(); return; }
  // Keep the search field and candidate DOM stable while typing in the composer.
  const selected = new Set(state.draft.selections.map((selection) => selection.itemId));
  for (const node of main.querySelectorAll('[data-action="toggle-item"]')) {
    const active = selected.has(node.dataset.id);
    node.classList.toggle('is-selected', active);
    node.setAttribute('aria-pressed', String(active));
  }
  renderComposer(state);
  updateComposerHeight();
});
render();
const initResult = store.init();
if (initResult && !initResult.ok) render();
window.addEventListener('error', () => toast('エラーが発生しました。設定からバックアップできます。'));
window.addEventListener('unhandledrejection', () => toast('処理に失敗しました。もう一度操作してください。'));

function updateKeyboard() {
  const viewport = window.visualViewport;
  const active = document.activeElement;
  const inputFocused = active?.matches?.('input:not([type="checkbox"]):not([type="file"]),textarea,select');
  const viewportHeight = viewport?.height || window.innerHeight;
  const inset = inputFocused ? Math.max(0, window.innerHeight - viewportHeight - (viewport?.offsetTop || 0)) : 0;
  document.documentElement.style.setProperty('--visual-height', viewportHeight + 'px');
  document.documentElement.style.setProperty('--keyboard-inset', inset + 'px');
  document.body.classList.toggle('keyboard-open', inset > 100 && !!inputFocused);
  document.body.classList.toggle('search-keyboard', inset > 100 && active?.id === 'search-input');
  updateComposerHeight();
}
window.visualViewport?.addEventListener('resize', updateKeyboard);
window.visualViewport?.addEventListener('scroll', updateKeyboard);
document.addEventListener('focusin', updateKeyboard);
document.addEventListener('focusout', () => requestAnimationFrame(updateKeyboard));
updateKeyboard();
