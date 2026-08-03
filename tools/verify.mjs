#!/usr/bin/env node
/* ============================================================================
   verify.mjs — file:// 安全 linter
   ----------------------------------------------------------------------------
   存在的唯一理由：

     fetch()、ESM、外部 SVG <use> 在 http://localhost 全部正常運作，
     在共用磁碟的 file:// 全部失效。

   所以「先在 localhost 測過了」不是證據 —— 那正是會靜默出貨的那一類 bug。
   這支腳本把那些差異變成 build-time 錯誤。

   用法：node tools/verify.mjs   （exit 0 才可以出貨）
   ============================================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const SRC = path.join(ROOT, 'src');

const fails = [];
const warns = [];
const fail = (f, m) => fails.push(`${f}: ${m}`);
const warn = (f, m) => warns.push(`${f}: ${m}`);

const rel = (f) => path.relative(ROOT, f);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(SITE);
const html = files.filter((f) => f.endsWith('.html'));
const js = files.filter((f) => f.endsWith('.js'));
const css = files.filter((f) => f.endsWith('.css'));

/* 建一份小寫檔名索引，用來做大小寫敏感的存在性檢查。
   macOS 預設不分大小寫，但共用磁碟／Linux 會分 —— 這種 bug 只在別人電腦上爆。 */
const onDisk = new Set(files.map((f) => path.relative(SITE, f)));
const onDiskLower = new Map(files.map((f) => [path.relative(SITE, f).toLowerCase(),
                                              path.relative(SITE, f)]));

/* ── 1. shipped JS 不得出現 fetch / XHR / ESM ─────────────────────────── */

for (const f of js) {
  const s = fs.readFileSync(f, 'utf8');
  const src = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  if (/\bfetch\s*\(/.test(src))            fail(rel(f), 'file:// 會擋 fetch()，資料請改用 *.data.js 全域變數');
  if (/\bXMLHttpRequest\b/.test(src))      fail(rel(f), 'file:// 會擋 XMLHttpRequest');
  if (/^\s*import\s/m.test(src))           fail(rel(f), 'file:// 不支援 ESM import，請用 classic script');
  if (/^\s*export\s/m.test(src))           fail(rel(f), 'file:// 不支援 ESM export');
  if (/\bimport\s*\(/.test(src))           fail(rel(f), 'file:// 不支援動態 import()');
}

for (const f of html) {
  const s = fs.readFileSync(f, 'utf8');
  if (/<script[^>]+type\s*=\s*["']module["']/.test(s)) {
    fail(rel(f), '<script type="module"> 在 file:// 會被擋');
  }
}

/* ── 2. 不得有 CDN / 外部資源 ─────────────────────────────────────────── */

const EXTERNAL = /(?:src|href)\s*=\s*["']https?:\/\/[^"']+["']/gi;
for (const f of [...html, ...css]) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(EXTERNAL)) {
    /* 純文字連結（<a href="https://...">）是允許的，只有會載入資源的才擋 */
    if (/^src/i.test(m[0])) fail(rel(f), `外部資源會在離線時失效：${m[0].slice(0, 70)}`);
  }
  for (const m of s.matchAll(/@import\s+(?:url\()?["']?https?:/gi)) {
    fail(rel(f), '@import 外部樣式表');
  }
  for (const m of s.matchAll(/url\(\s*["']?https?:\/\/[^)]*\)/gi)) {
    fail(rel(f), `CSS url() 指向外部主機：${m[0].slice(0, 60)}`);
  }
}

/* ── 3. 絕對路徑會解析到檔案系統根目錄 ───────────────────────────────── */

for (const f of [...html, ...css]) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/(?:src|href)\s*=\s*["']\/(?!\/)[^"']*["']/g)) {
    fail(rel(f), `絕對路徑在 file:// 會指到檔案系統根目錄：${m[0].slice(0, 60)}`);
  }
}

/* ── 4. @font-face 相對路徑在 file:// 載不到 ─────────────────────────── */

for (const f of css) {
  const s = fs.readFileSync(f, 'utf8');
  if (/@font-face/.test(s)) {
    fail(rel(f), '@font-face 在 file:// 無法載入，請只用系統字型堆疊');
  }
}

/* ── 5. 外部 SVG <use> 在 file:// 被擋 ───────────────────────────────── */

for (const f of html) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/<use\b[^>]*(?:xlink:)?href\s*=\s*["']([^"'#]+)#/g)) {
    fail(rel(f), `外部 SVG sprite 在 file:// 被擋：<use href="${m[1]}#…">，符號必須 inline 進頁面`);
  }
}

/* ── 6. 引用的檔案要真的存在（大小寫敏感） ───────────────────────────── */

for (const f of html) {
  const s = fs.readFileSync(f, 'utf8');
  const dir = path.dirname(f);
  for (const m of s.matchAll(/(?:src|href)\s*=\s*["']([^"':#?][^"':]*?)["']/g)) {
    const target = m[1].split(/[?#]/)[0];
    if (!target || /^(https?|mailto|data|tel):/i.test(target)) continue;
    const abs = path.resolve(dir, target);
    const r = path.relative(SITE, abs);
    if (r.startsWith('..')) { fail(rel(f), `引用到 site/ 之外：${target}`); continue; }
    if (!onDisk.has(r)) {
      if (onDiskLower.has(r.toLowerCase())) {
        fail(rel(f), `大小寫不符：引用 ${r}，磁碟上是 ${onDiskLower.get(r.toLowerCase())}` +
                     `（macOS 不分大小寫，但共用磁碟／Linux 會分）`);
      } else {
        fail(rel(f), `引用的檔案不存在：${target}`);
      }
    }
  }
}

/* ── 7. 產出檔名不得含非 ASCII（SMB/exFAT 正規化遲早弄壞） ──────────── */

for (const f of files) {
  const base = path.basename(f);
  // eslint-disable-next-line no-control-regex
  if (/[^\x20-\x7E]/.test(base)) {
    fail(rel(f), '檔名含非 ASCII 字元，在 SMB／exFAT 上會被正規化弄壞');
  }
  if (/\s/.test(base)) warn(rel(f), '檔名含空白，建議避免');
}

/* ── 8. SVG 品質：title/desc、字面色碼、同頁 id 撞名 ─────────────────── */

const svgSrc = walk(path.join(SRC, 'svg')).filter((f) => f.endsWith('.svg'));
for (const f of svgSrc) {
  const s = fs.readFileSync(f, 'utf8');
  const isDefs = path.basename(f) === '_defs.svg';
  if (!isDefs) {
    if (!/<title[\s>]/.test(s)) fail(rel(f), '缺 <title>（螢幕閱讀器必要）');
    if (!/<desc[\s>]/.test(s))  fail(rel(f), '缺 <desc>（螢幕閱讀器必要）');
    if (!/viewBox\s*=\s*"0 0 1000 /.test(s)) {
      warn(rel(f), 'viewBox 寬度不是 1000 —— 慣例是 "0 0 1000 H"，這樣線寬字級才能跨圖複製');
    }
    const noC = s.replace(/<!--[\s\S]*?-->/g, '');
    const lit = noC.match(/(?:fill|stroke|stop-color)\s*=\s*"(#[0-9a-fA-F]{3,8}|rgba?\()/g);
    if (lit) fail(rel(f), `出現字面色碼（${lit.length} 處）—— 顏色只能走 class → diagram.css → token`);
  }
}

/* 同一頁面內的 element id 撞名：兩張 inline SVG 的 gradient/marker 會靜默抓錯 def */
for (const f of html) {
  const s = fs.readFileSync(f, 'utf8');
  const ids = [...s.matchAll(/\sid\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set(), dup = new Set();
  for (const id of ids) { if (seen.has(id)) dup.add(id); seen.add(id); }
  if (dup.size) fail(rel(f), `同頁 id 重複：${[...dup].slice(0, 6).join(', ')}`);
}

/* ── 9. widget id 唯一、glossary 詞彙都有定義 ───────────────────────── */

const glossary = JSON.parse(fs.readFileSync(path.join(SRC, 'data', 'glossary.json'), 'utf8'));
const allWids = new Map();
for (const f of html) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/data-wid\s*=\s*"([^"]+)"/g)) {
    if (allWids.has(m[1])) fail(rel(f), `widget id 與 ${allWids.get(m[1])} 重複：${m[1]}`);
    allWids.set(m[1], rel(f));
  }
  for (const m of s.matchAll(/data-term\s*=\s*"([^"]+)"/g)) {
    if (!glossary[m[1]]) fail(rel(f), `詞彙未定義：${m[1]}`);
  }
}

/* 未被任何模組使用的詞彙（不是錯誤，但值得知道） */
const usedTerms = new Set();
for (const f of html) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/data-term\s*=\s*"([^"]+)"/g)) usedTerms.add(m[1]);
}
const unused = Object.keys(glossary).filter((k) => !usedTerms.has(k));
if (unused.length) warn('glossary.json', `${unused.length} 條詞彙尚未被任何模組引用：${unused.slice(0, 8).join('、')}${unused.length > 8 ? '…' : ''}`);

/* ── 10. 教材必須自成一體：不得引用外部投影片 ────────────────────────
   這份教材是獨立的，讀者不該需要去翻任何投影片才能看懂。
   這一項會擋掉 Deck 代號、投影片編號，以及「五份投影片」那類後設敘述。   */

const SELF_CONTAINED = [
  [/Deck\s*[A-E]\b/g, 'Deck 代號（讀者手上沒有那些投影片）'],
  [/投影片\s*\d/g, '投影片編號'],
  [/(?:五|四|三|兩|２|\d)\s*(?:份|篇)\s*(?:論文|投影片|說明|簡報)/g,
   '「兩篇論文／五份投影片」這類指向外部文件的說法'],
  [/(?:論文|投影片|簡報)的(?:投影片|內容|說明)/g, '指向外部文件'],
  [/看懂[^。]{0,12}(?:論文|投影片|簡報)/g, '把終點定義成「看懂外部文件」'],
  [/\bslide\s*\d/gi, 'slide 編號'],
];
for (const f of [...html, path.join(SRC, 'data/quizzes.json'), path.join(SRC, 'data/glossary.json')]) {
  if (!fs.existsSync(f)) continue;
  const s = fs.readFileSync(f, 'utf8');
  for (const [re, what] of SELF_CONTAINED) {
    const hits = s.match(re);
    if (hits) fail(rel(f), `出現${what}（${hits.length} 處，例：${hits[0]}）—— 教材必須自成一體`);
  }
}

/* ── 10.5 頁面結構不得重複 ────────────────────────────────────────────
   曾經發生過：內容裡的 grep 指令含有 `$'`，而 String.replace 的
   *替換字串* 會把 $' 解讀成「插入比對位置之後的全部內容」，
   於是整個 shell 尾巴被重新插了一次 —— core.js 被載入兩次，
   第二次把 widget 註冊表清空，該頁所有互動元件靜默失效。
   產生器已改用函式形式的替換，這裡是防回歸。                            */

for (const f of html) {
  const s = fs.readFileSync(f, 'utf8');
  for (const [tag, re] of [['</body>', /<\/body>/g], ['</html>', /<\/html>/g],
                           ['<!doctype', /<!doctype/gi]]) {
    const n = (s.match(re) || []).length;
    if (n > 1) fail(rel(f), `${tag} 出現 ${n} 次 —— 頁面結構重複（檢查替換字串裡的 $' 與 $\``);
  }
  const dupScript = {};
  for (const m of s.matchAll(/<script src="([^"]+)"/g)) {
    dupScript[m[1]] = (dupScript[m[1]] || 0) + 1;
  }
  const dups = Object.entries(dupScript).filter(([, n]) => n > 1);
  if (dups.length) {
    fail(rel(f), `同一支 JS 被載入多次：${dups.map(([k, n]) => `${k}×${n}`).join(', ')}` +
                 ` —— core.js 重複載入會清空 widget 註冊表`);
  }
}

/* ── 11. 十個「不要搞混」警告框必須全部就位 ──────────────────────────
   這十個處理的是新人一定會誤解、而且錯了會影響結論的地方。
   它們是本教材相對於原始素材最大的增值，改寫內容時很容易不小心刪掉 ——
   所以在這裡把它變成 build-time 錯誤。                                    */

const GUARD_TOPICS = {
  1: 'HP1/HP2 不等於父系母系',
  2: 'tumor purity 不等於 tumor DNA fraction',
  3: 'VAF 不等於 cancer cell fraction',
  4: 'LOH 不等於缺失',
  5: 'PON 有兩個意思',
  6: 'matched-normal calling 不是 VCF 相減',
  7: '一條 read 是一個分子，不是一個細胞',
  8: '甲基化相關性不是因果',
  9: 'latent node 不是未觀測到的細胞',
  10: '後處理救不回 caller 漏掉的變異',
};
const guardsFound = new Set();
for (const f of fs.existsSync(path.join(SRC, 'modules'))
  ? walk(path.join(SRC, 'modules')).filter((x) => x.endsWith('.html')) : []) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\{\{guard:(\d+)/g)) guardsFound.add(+m[1]);
}
const guardsMissing = Object.keys(GUARD_TOPICS).map(Number).filter((n) => !guardsFound.has(n));
if (guardsMissing.length) {
  for (const n of guardsMissing) {
    fail('src/modules/', `缺少 guardrail #${n}（${GUARD_TOPICS[n]}）` +
      ` —— 十個警告框必須全部就位，這是本教材最大的增值`);
  }
}

/* ── 12. 大小預算 ────────────────────────────────────────────────────── */

let total = 0;
for (const f of files) total += fs.statSync(f).size;
const mb = total / 1024 / 1024;
if (mb > 40) fail('site/', `總大小 ${mb.toFixed(1)} MB 超過 40 MB 預算`);
else if (mb > 25) warn('site/', `總大小 ${mb.toFixed(1)} MB，接近 25 MB 警戒線`);

/* ── 報告 ───────────────────────────────────────────────────────────── */

console.log(`\n  檢查 ${files.length} 個檔案（${html.length} HTML · ${js.length} JS · ${css.length} CSS）` +
            ` · ${mb.toFixed(2)} MB`);

if (warns.length) {
  console.log(`\n  ⚠ ${warns.length} 個警告`);
  warns.forEach((w) => console.log(`    · ${w}`));
}

if (fails.length) {
  console.error(`\n  ✗ ${fails.length} 項未通過 —— 不可出貨\n`);
  fails.forEach((e) => console.error(`    · ${e}`));
  console.error('');
  process.exit(1);
}

console.log(`\n  ✓ file:// 安全檢查全數通過\n`);
