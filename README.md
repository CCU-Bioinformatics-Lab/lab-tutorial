# 長讀癌症基因體學 · 入門教材

給實驗室新進成員（零癌症生物學／零定序背景）的自學教材。
讀完 M0–M13 之後，應該能看懂 LongPhase-S（Deck A）與 LongPhase-TO（Deck B）兩份口試投影片。

---

## 給學生：怎麼看

**直接用瀏覽器打開 `site/index.html` 就好。不需要安裝任何東西。**

整包 `site/` 資料夾可以複製到隨身碟、共用磁碟或另一台電腦，一樣能用。

- 右上角可切換 **中／EN／雙語** 的詞彙定義、深淺色、字級
- 進度會自動存在瀏覽器裡。**換電腦請用首頁的「匯出進度／匯入進度」**
  （原因見下方「file:// 的限制」）
- 想印成紙本：首頁的「完整手冊（可列印）」→ Cmd-P → 存成 PDF

---

## 給維護者：怎麼改

```bash
node tools/build.mjs           # src/ → site/，約 30 ms，零 npm 依賴
node tools/build.mjs --watch   # 監看 src/ 自動重建
node tools/verify.mjs          # file:// 安全檢查，exit 0 才可以發佈
```

改完 `src/` 底下的東西，**一定要重新 build**，因為 `site/` 是產出物。

### 目錄結構

```
src/                      作者用，學生不會打開
├─ modules/m00…m13.html   每個模組一個檔（300–600 行）
├─ partials/shell.html    唯一的頁面模板
├─ svg/*.svg              手繪圖，一圖一檔，可獨立開啟預覽
└─ data/
   ├─ glossary.json       詞彙（唯一來源）
   ├─ modules.json        模組順序與 metadata
   ├─ quizzes.json        測驗題庫
   └─ decks.json          Deck 代號 → 實際 .pptx 檔名

tools/                    不會發佈
├─ build.mjs              產生器
├─ verify.mjs             file:// 安全 linter
├─ index_decks.py         掃描 .pptx → deck_index.json（選圖用）
├─ figures.json           人工策展：要抽哪幾張圖
└─ extract_media.py       抽圖 + 縮圖

site/                     ★ 交付物，整包複製就能用
```

### 為什麼要有 build step

只有這樣才能讓 SVG 同時是 **(a)** 可獨立開啟編輯的 `.svg` 檔，
又 **(b)** inline 進頁面讓 CSS variable 主題化生效。
沒有 build 就只能二選一。

順便讓產生器可以在 build 時擋掉：未定義的詞彙、重複的 widget id、
缺 `<title>` 的 SVG、寫死顏色的 SVG、指向不存在檔案的圖。

### 寫模組的語法

模組檔開頭是 front-matter，然後是五段式區塊：

```html
<!--tw
{ "objectives": ["讀完你應該能…"] }
-->

<section data-part="why">      為什麼重要
<section data-part="concept">   概念與互動
<section data-part="evidence">  真實證據
<section data-part="predict">   先預測，再揭曉
<section data-part="where">     這出現在哪
```

可用的 macro：

| 寫法 | 作用 |
|---|---|
| `[[term]]` / `[[term\|顯示文字]]` | 詞彙 tooltip。**未定義會 build 失敗** |
| `{{svg:name \| 說明 [wide]}}` | inline `src/svg/name.svg`，自動處理 id 撞名 |
| `{{fig:key}}` | 引用 `figures.json` 抽出來的圖 |
| `{{widget:type #id {json} \| 說明}}` | 掛互動元件 |
| `{{guard:n \| 標題}}…{{/guard}}` | 「不要搞混」警告框 |
| `{{ask}}…{{reveal}}…{{/ask}}` | 先預測再揭曉 |
| `{{source deck=A slide=27}}…{{/source}}` | 來源卡 |
| `{{cli}}…{{/cli}}` | 指令區塊 |
| `{{quiz:mNN}}` | 插入測驗 |

要輸出字面的 `{{` 或 `[[`，寫 `{{{` 或 `[[[`。

### 畫新圖的規則

1. `viewBox="0 0 1000 H"`，寬度永遠 1000 user unit
2. **只用 class，不寫死任何顏色**（build 會拒絕）
3. 必須有 `<title>` 與 `<desc>`
4. 字級：標題 30 / 標籤 22 / 註解 18 / 刻度 15；線寬 1.5 / 2.5 / 4
5. **色相依標記形狀分工**：read 本體 = haplotype 色、字母 = base 色、
   上方小圓 = variant class、下方小點 = methylation。
   同一種形狀不要承載兩種編碼。

可用的 class 全部列在 `site/assets/css/diagram.css`。

### 新增互動元件

放在 `site/assets/js/widgets/<type>.js`，實作這個契約：

```js
TW.define('my-widget', function (root, cfg) {
  return {
    init(),                  // 建一次 DOM
    render(),                // model → DOM，必須是純的、可重複呼叫
    reset(),                 // 只清使用者輸入，不重抽題目
    check(),                 // → {ok, score, message}，不可改動 model
    getState(), setState(s)  // 只處理使用者輸入
  };
});
```

用 `TW.rng(cfg.seed)` 而不是 `Math.random()` —— 這樣「隨機」資料在每個人、
每次開啟都一樣，meeting 上可以說「看第 7 條 read」而大家看到同一條。

---

## file:// 的限制（重要）

`file://` 不是「換個 scheme 的 http」。瀏覽器給每個本機檔案一個 opaque origin，
所以下列東西**全部失效**：

| 失效 | 因應 |
|---|---|
| `fetch()` / `XMLHttpRequest` | 資料一律做成 `*.data.js` 掛在 `window` 上 |
| `<script type="module">` / ESM | 只用 classic script |
| `@font-face` 相對路徑 | 只用系統字型堆疊 |
| 外部 SVG `<use href="x.svg#id">` | 符號逐頁 inline |
| 絕對路徑 `/assets/…` | 一律用相對路徑 |

**而且這些在 `http://localhost` 全部正常。**
所以驗收時**絕不能只在 localhost 測** —— 那正是會靜默出貨的那一類 bug。
`tools/verify.mjs` 就是為了把這些差異變成 build-time 錯誤而存在的。

同一個原因也影響進度儲存：`file://` 是單一 opaque origin，
所以進度綁在「這台電腦的這個瀏覽器」，不會跟著檔案走。
因此「匯出／匯入進度」是第一級功能，不是附加功能。

---

## 抽新的圖

```bash
python3 tools/index_decks.py --big 4    # 掃描五份 deck，列出 >4 MP 的圖
# 讀 tools/deck_index.json，用「投影片標題」挑圖
# 把想要的加進 tools/figures.json
python3 tools/extract_media.py          # 抽圖 + 縮圖
node tools/build.mjs                    # 重新產生頁面
```

注意事項：

- 那份 100 MB 的 deck 裡有 **7 張超過 Pillow 預設的 89 MP 門檻**（最大 110 MP）。
  腳本已把上限抬到 200 MP。
- 有六張 **27000×3600** 的全基因體帶狀圖。縮到 1600px 寬等於 0.21 px/原始 px，
  刻度標籤會全部消失。**要用就得 `crop` 或 `tile`，不能整張縮。**
- IGV 截圖用 `"q": 92`（q82 會把文字反鋸齒抹糊）。
- 圖片預算：`site/assets/img/` 超過 25 MB 會警告。目前約 2 MB。

---

## 已知的待補項目

MVP 範圍是 M0–M13 + Capstone。以下刻意留到 v2：

| 項目 | 內容 |
|---|---|
| **M14** | Boolean hypercube、Camin–Sokal parsimony、Group Steiner arborescence（Deck E 的演算法基礎） |
| **M15** | Deck C / D / E 三篇延伸論文的 case study |
| **M16** | Capstone 第二階段：真實 pipeline 重現（合成 purity 樣本 → 跑 caller → 對 SEQC2 評估） |
| mutation-tree builder widget | 展示部分覆蓋 read 造成的候選樹多解 |
| Capstone 的 precomputed 資料 | 兩個 repo 都沒附範例資料，需要自備一份小的 BAM/VCF 切片 |

---

## 教材內容的三個原則

### 1. 這份教材必須自成一體 ★

讀者手上<b>沒有</b>任何投影片。所以內文不可以出現：

- Deck 代號（Deck A、Deck B…）
- 投影片編號（「投影片 27」、「slide 4」）
- 「五份投影片有一個共同的問題」這類後設敘述
- 「這個 M7 會講」這種<b>用來迴避當下該給的解釋</b>的寫法

`tools/verify.mjs` 的第 10 項會擋掉前三種，`tools/audit_order.mjs` 的第 3 項會抓第四種。

**指向後面模組是可以的**（「之後會用一個滑桿讓你體驗」），
但那必須是<b>預告深度</b>，不能是<b>把答案推給別人</b>。
判準很簡單：把那句話刪掉之後，當下的段落還講得通嗎？

### 2. 概念要在第一次實質使用時就講清楚

`tools/audit_order.mjs` 的第 1 項會列出「某個詞首次使用的模組比講解它的模組更早」。
不是每一筆都要改 —— 如果那個詞在使用處就有一句話定義（或有圖），那是可以的。
要避免的是「丟一個沒解釋的術語，然後叫讀者自己去別的地方找」。

第 2 項會列出每個模組引入幾個新詞。**單一模組超過 14 個就偏多**，
代表那一節塞了太多東西，該拆開或往後移。

### 3. 指令與欄位名稱一律以原始碼為準

這幾個工具的說明文件有與程式碼不符的地方
（`--sv-window` 實際是 `--svWindow`、`modcall` 的 `--bam-file`
實際是 `--methylbamfile`、PoN 下載範例會覆蓋 shell 的 `PATH`）。
權威是 `Phasing.cpp` / `SomaticHaplotag.cpp` 裡的 `longopts` 表。

### 另外：十個「不要搞混」警告框不要刪

它們處理的是新人一定會誤解、而且錯了會影響結論的地方。
`build.mjs` 每次會回報有幾個就位。

---

## 檢查工具

```bash
node tools/build.mjs              # 建置（會擋掉未定義詞彙、寫死顏色的 SVG…）
node tools/verify.mjs             # file:// 安全 + 教材自成一體檢查
node tools/audit_order.mjs        # 教學順序稽核
python3 tools/check_svg_layout.py # SVG 文字重疊與超出畫布
```

最後那一支特別值得跑：**CJK 字形是滿高滿寬的**，18px 的中文需要約 26px 行距才不會擠在一起，
但這件事在原始碼上完全看不出來，要算 bounding box 才會發現。

## 發布

**push 到 `main` 就會自動發布**，不需要另外做什麼。

`.github/workflows/deploy.yml` 會跑上面四支工具，然後把 `site/` 發布到
<https://ccu-bioinformatics-lab.github.io/lab-tutorial/>。任何一支沒過就不會發布。

它還會多做一件事：**比對 commit 進來的 `site/` 與 `src/` 重建出來的結果**。
`site/` 是 committed 的交付物（學生直接用 `file://` 打開），所以改了 `src/`
卻忘記重新建置時，repo 裡的 `site/` 會跟 `src/` 不一致 —— 這種落後沒有任何錯誤訊息。
所以請養成習慣：

```bash
node tools/build.mjs          # 改完 src/ 一定要重建
git add src site              # site/ 要跟著一起 commit
```

Pull request 只跑檢查，不發布。

> 早期的發布方式是手動把 `site/` 推到 `gh-pages` 分支，也就是「push 兩次」。
> 忘了第二步線上版本就會悄悄落後，所以改成 workflow。`gh-pages` 分支已經不再使用
> （留著當回溯點，可以隨時刪）。
