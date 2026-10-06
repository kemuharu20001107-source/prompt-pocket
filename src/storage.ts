import { STATUSES, type AppData } from './types';
const DB_NAME = 'prompt-pocket';
let opening: Promise<IDBDatabase> | undefined;
function db() { return opening ??= new Promise((resolve,reject) => { const req = indexedDB.open(DB_NAME,1); req.onupgradeneeded=()=>req.result.createObjectStore('snapshots'); req.onsuccess=()=>{const database=req.result;database.onversionchange=()=>database.close();resolve(database);}; req.onerror=()=>{opening=undefined;reject(req.error);}; req.onblocked=()=>{opening=undefined;reject(new Error('別のタブを閉じて再読み込みしてください。'));}; }); }
export async function loadData(): Promise<AppData | null> { const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('snapshots','readonly');const req=tx.objectStore('snapshots').get('current');req.onsuccess=()=>{try {resolve(req.result ? validateData(req.result) : null);}catch(error){reject(error);}};req.onerror=()=>reject(req.error);}); }
export async function saveData(data:AppData):Promise<void> { const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('snapshots','readwrite');tx.objectStore('snapshots').put(data,'current');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error || new Error('保存を完了できませんでした。'));}); }
type Obj=Record<string,unknown>;
const obj=(v:unknown):Obj=>{if(!v || typeof v!=='object' || Array.isArray(v))throw new Error('データの構造が不正です。');return v as Obj;};
const array=(v:unknown):unknown[]=>{if(!Array.isArray(v)||v.length>50000)throw new Error('データの配列が不正です。');return v;};
const str=(v:unknown)=>{if(typeof v!=='string'||v.length>1000000)throw new Error('文字列の形式が不正です。');};
function fields(o:Obj,names:string[]){names.forEach(n=>str(o[n]));}
function records(v:unknown,fieldsList:string[]){const ids=new Set<string>();return array(v).map(x=>{const o=obj(x);fields(o,['id',...fieldsList]);if(!o.id||ids.has(o.id as string))throw new Error('ID が重複しています。');ids.add(o.id as string);return o;});}
function date(v:unknown){str(v);if(!Number.isFinite(Date.parse(v as string)))throw new Error('日時の形式が不正です。');}
function ref(v:unknown,ids:Set<unknown>){str(v);if(v!==''&&!ids.has(v))throw new Error('存在しないデータへの参照があります。');}
export function validateData(value:unknown):AppData { const d=obj(value);if(d.schemaVersion!==1)throw new Error('対応していないバックアップ形式です。');
  const cats=records(d.categories,['name']);const catIds=new Set(cats.map(c=>c.id));
  const dict=records(d.dictionary,['name','text','categoryId','memo']);dict.forEach(p=>{ref(p.categoryId,catIds);if(typeof p.favorite!=='boolean'||!Number.isSafeInteger(p.uses)||Number(p.uses)<0)throw new Error('辞書データが不正です。');if(p.lastUsedAt!==null)date(p.lastUsedAt);});
  const chars=records(d.characters,['name','prompt','negative','memo']);const charIds=new Set(chars.map(c=>c.id));records(d.templates,['name','prompt','negative','memo']);records(d.presets,['name','prompt','negative','memo']);
  const works=records(d.works,['name','characterName','characterId','memo','commonPrompt','commonNegative','createdAt','updatedAt']);
  works.forEach(w=>{date(w.createdAt);date(w.updatedAt);ref(w.characterId,charIds);const scenes=records(w.scenes,['name','background','outfit','time','lighting','prompt','negative','memo']);const sceneIds=new Set(scenes.map(s=>s.id));const pages=records(w.pages,['title','memo','sceneId','prompt','negative','revisionMemo','background','outfit','style','createdAt','updatedAt']);pages.forEach((p,i)=>{if(p.number!==i+1||!STATUSES.includes(p.status as typeof STATUSES[number]))throw new Error('ページ番号または状態が不正です。');date(p.createdAt);date(p.updatedAt);ref(p.sceneId,sceneIds);array(p.reasons).forEach(str);const selectionIds=new Set();array(p.selections).forEach(v=>{const s=obj(v);fields(s,['promptId','text']);if(selectionIds.has(s.promptId)||typeof s.weight!=='number'||!Number.isFinite(s.weight)||s.weight<0.1||s.weight>3)throw new Error('重みまたは選択データが不正です。');selectionIds.add(s.promptId);});['promptOverride','negativeOverride'].forEach(k=>{if(p[k]!==null)str(p[k]);});if(p.previewAssetId!==undefined)str(p.previewAssetId);});});
  const settings=obj(d.settings);if(typeof settings.autoAdvance!=='boolean')throw new Error('設定が不正です。');ref(settings.activeWorkId,new Set(works.map(w=>w.id)));const active=works.find(w=>w.id===settings.activeWorkId);ref(settings.activePageId,new Set(active?array(active.pages).map(p=>obj(p).id):[]));
  return structuredClone(d) as unknown as AppData;
}
export function exportJSON(data:AppData){return JSON.stringify(data,null,2);}
export function importJSON(text:string):AppData {if(text.length>20*1024*1024)throw new Error('バックアップは20MB以下にしてください。');return validateData(JSON.parse(text));}
