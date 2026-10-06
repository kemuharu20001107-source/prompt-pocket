import { describe, expect, it } from 'vitest';
import { applyRange, assemblePrompt, createPage, createWork, duplicatePage, joinPrompt, parseBulkPages, productionQueue, progress, togglePrompt } from '../src/model';
import { initialData, demoWork } from '../src/seed';
import { STATUSES, type Template } from '../src/types';

function promptFixture() {
  const data = initialData();
  const character = { id: 'character-a', name: '葵', prompt: 'blue hair', negative: 'wrong hair', memo: '主人公' };
  data.characters.push(character);
  const work = createWork('短い物語', character.id, character.name);
  work.commonPrompt = '  best quality  ';
  work.commonNegative = 'low quality';
  work.scenes.push({ id: 'scene-a', name: 'オフィスの夜', background: 'office', outfit: 'suit', time: 'night', lighting: 'warm light', prompt: 'window', negative: 'daylight', memo: '' });
  const page = createPage(1, '振り向く');
  Object.assign(page, { sceneId: 'scene-a', background: 'desk', outfit: 'tie', style: 'anime style', prompt: 'looking back', negative: 'bad hands' });
  page.selections = [
    { promptId: data.dictionary[0].id, text: 'looking at viewer', weight: 1.2 },
    { promptId: data.dictionary[1].id, text: 'smile', weight: 1 },
  ];
  work.pages.push(page);
  data.works.push(work);
  return { data, work, page };
}

describe('page prompt construction', () => {
  it('composes work, character, scene, range fields, page and weighted dictionary selections in order', () => {
    const { data, work, page } = promptFixture();
    expect(assemblePrompt(data, work, page)).toEqual({
      prompt: 'best quality, blue hair, office, suit, night, warm light, window, desk, tie, anime style, looking back, (looking at viewer:1.2), smile',
      negative: 'low quality, wrong hair, daylight, bad hands',
    });
  });

  it('resolves current linked scene and character values rather than copying stale values to pages', () => {
    const { data, work, page } = promptFixture();
    work.scenes[0].lighting = 'moonlight';
    data.characters[0].prompt = 'short blue hair';
    const result = assemblePrompt(data, work, page).prompt;
    expect(result).toContain('short blue hair');
    expect(result).toContain('moonlight');
    expect(result).not.toContain('warm light');
  });

  it('keeps generated output separate from direct-edit overrides, including an intentional empty override', () => {
    const { data, work, page } = promptFixture();
    page.promptOverride = '';
    page.negativeOverride = 'custom negative';
    const generated = assemblePrompt(data, work, page);
    expect(generated.prompt).toContain('best quality');
    expect(page.promptOverride ?? generated.prompt).toBe('');
    expect(page.negativeOverride ?? generated.negative).toBe('custom negative');
    page.promptOverride = null;
    expect(page.promptOverride ?? generated.prompt).toBe(generated.prompt);
  });

  it('omits missing optional layers and whitespace without stray separators', () => {
    const data = initialData();
    const work = createWork('空の作品');
    const page = createPage(1);
    page.prompt = '  close-up  ';
    expect(assemblePrompt(data, work, page)).toEqual({ prompt: 'close-up', negative: '' });
    expect(joinPrompt('', '  ', undefined, ' night ', 'soft light')).toBe('night, soft light');
  });

  it('toggles dictionary selections, records additions, and preserves an independent text snapshot', () => {
    const data = initialData();
    const page = createPage(1);
    const entry = data.dictionary[0];
    const original = entry.text;
    togglePrompt(data, page, entry.id);
    expect(page.selections).toEqual([{ promptId: entry.id, text: original, weight: 1 }]);
    expect(entry.uses).toBe(1);
    expect(Number.isFinite(Date.parse(entry.lastUsedAt!))).toBe(true);
    entry.text = 'updated dictionary text';
    expect(page.selections[0].text).toBe(original);
    togglePrompt(data, page, entry.id);
    expect(page.selections).toEqual([]);
    expect(entry.uses).toBe(1);
    togglePrompt(data, page, entry.id);
    expect(entry.uses).toBe(2);
    expect(page.selections[0].text).toBe('updated dictionary text');
    togglePrompt(data, page, 'missing-id');
    expect(page.selections).toHaveLength(1);
  });
});

describe('page planning and duplication', () => {
  const template: Template = { id: 'template-a', name: '会話', prompt: 'talking, two people', negative: 'blurry', memo: '机を挟んだ会話' };

  it('creates a fresh page from a template with independent production fields', () => {
    const page = createPage(1, '会話シーン', template);
    expect(page).toMatchObject({ number: 1, title: '会話シーン', prompt: template.prompt, negative: template.negative, memo: template.memo, status: '未作成', reasons: [], selections: [], promptOverride: null, negativeOverride: null });
    expect(page.id).toBeTruthy();
    expect(page.createdAt).toBe(page.updatedAt);
    expect(createPage(2).title).toBe('ページ 2');
  });

  it('duplicates prompt and scene settings, resets production records and renumbers following pages', () => {
    const { work, page } = promptFixture();
    page.status = '再生成';
    page.reasons = ['手', '表情'];
    page.revisionMemo = '指を直す';
    page.previewAssetId = 'preview-a';
    page.promptOverride = 'hand-edited prompt';
    work.pages.push(createPage(2, '続き'));
    const copy = duplicatePage(work, page);
    expect(work.pages.map(p => p.number)).toEqual([1, 2, 3]);
    expect(work.pages[1]).toBe(copy);
    expect(copy.id).not.toBe(page.id);
    expect(copy).toMatchObject({ title: '振り向く（複製）', status: '未作成', reasons: [], revisionMemo: '', sceneId: page.sceneId, prompt: page.prompt, negative: page.negative, memo: page.memo, promptOverride: 'hand-edited prompt' });
    expect(copy.previewAssetId).toBeUndefined();
    copy.selections[0].weight = 1.5;
    expect(page.selections[0].weight).toBe(1.2);
    expect(page.reasons).toEqual(['手', '表情']);
  });

  it('imports numbered pipe rows, full-width pipes and plain lines while ignoring blank lines', () => {
    const pages = parseBulkPages('1|導入\r\n\r\n 2 ｜ 会話 \r\n振り向く\n   \n40|目元アップ', 4, template);
    expect(pages.map(p => [p.number, p.title])).toEqual([[4, '導入'], [5, '会話'], [6, '振り向く'], [7, '目元アップ']]);
    expect(pages.every(p => p.prompt === template.prompt && p.negative === template.negative && p.status === '未作成')).toBe(true);
    expect(new Set(pages.map(p => p.id)).size).toBe(4);
    expect(parseBulkPages(' \n\r\n', 1)).toEqual([]);
  });
});

describe('production and progress', () => {
  it('counts all states and matches 27 / 40 complete at 67 percent', () => {
    const work = createWork('40ページ作品');
    work.pages = Array.from({ length: 40 }, (_, i) => {
      const page = createPage(i + 1);
      page.status = i < 27 ? '完成' : STATUSES[(i - 27) % 5];
      return page;
    });
    const result = progress(work);
    expect(result).toMatchObject({ total: 40, completed: 27, percent: 67 });
    expect(result.counts).toEqual({ '未作成': 3, 'プロンプト完成': 3, '生成済み': 3, '再生成': 2, '採用': 2, '完成': 27 });
    expect(progress(createWork('空の作品'))).toMatchObject({ total: 0, completed: 0, percent: 0 });
  });

  it('processes unfinished pages in page order and narrows regeneration without mutating the work array', () => {
    const work = demoWork();
    const originalOrder = [...work.pages].reverse();
    work.pages = originalOrder;
    expect(productionQueue(work).map(p => p.number)).toEqual([3, 4, 5, 6]);
    expect(productionQueue(work, 'regenerate').map(p => p.number)).toEqual([4]);
    expect(work.pages).toEqual(originalOrder);
    work.pages.find(p => p.number === 4)!.status = '完成';
    expect(productionQueue(work, 'regenerate')).toEqual([]);
    expect(productionQueue(work).map(p => p.number)).toEqual([3, 5, 6]);
  });
});

describe('range settings', () => {
  function rangeWork() {
    const work = createWork('範囲テスト');
    work.pages = [1, 2, 3, 4].map(n => {
      const page = createPage(n);
      page.outfit = 'original outfit';
      page.prompt = `page ${n} prompt`;
      page.updatedAt = '2020-01-01T00:00:00.000Z';
      return page;
    });
    return work;
  }

  it('applies only supplied fields to an inclusive range and leaves other pages intact', () => {
    const work = rangeWork();
    const outside = structuredClone([work.pages[0], work.pages[3]]);
    applyRange(work, 2, 3, { sceneId: 'scene-b', background: 'office', style: 'manga' });
    expect([work.pages[0], work.pages[3]]).toEqual(outside);
    for (const page of work.pages.slice(1, 3)) {
      expect(page).toMatchObject({ sceneId: 'scene-b', background: 'office', style: 'manga', outfit: 'original outfit', prompt: `page ${page.number} prompt` });
      expect(page.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
    }
    applyRange(work, 2, 2, { outfit: '' });
    expect(work.pages[1].outfit).toBe('');
    expect(work.pages[2].outfit).toBe('original outfit');
  });

  it.each([[0, 2], [2, 1], [1, 5], [1.5, 3], [1, 3.5], [NaN, 2], [1, Infinity]])('rejects invalid range %s..%s without any partial update', (from, to) => {
    const work = rangeWork();
    const before = structuredClone(work);
    expect(() => applyRange(work, from, to, { background: 'unexpected' })).toThrow('有効なページ範囲');
    expect(work).toEqual(before);
  });
});
