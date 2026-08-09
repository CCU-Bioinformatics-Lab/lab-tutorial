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

教材範圍是 **M0–M13 + Capstone**（首頁的總時數只加總這些）。
Capstone 之後是**研究指引**區塊 —— 那不是課程，是研究方向的說明，
所以不計時數，也不做學習檢核。

研究指引在 `modules.json` 裡多一個 `topic` 欄位，首頁會據此在 group 之下再分一層。
一個主題可以有好幾頁；目前只有「主題一 · Subclone 系統發生重建」（上／下兩篇）。
要加新主題就給一個新的 `topic` 字串，不必動 `build.mjs`。

以下刻意留到之後：

| 項目 | 內容 |
|---|---|
| 研究指引 主題二以後 | 尚未開始 |
| **Capstone 第二階段** | 真實 pipeline 重現（合成 purity 樣本 → 跑 caller → 對 SEQC2 評估） |
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

## 研究指引頁的語體：學術語體，不是教材語體

教材模組（M0–M13、Capstone）之後的章節 —— 目前是 `研究指引` 群組的
`sr1-landscape.html`、`sr2-implementation.html`，以及日後新增的任何主題 ——
**讀者是實驗室成員與論文審閱者，不是自學者**。這些頁面的內容會直接成為論文的骨架，
所以語體必須是學術語體。

教材語體（對讀者說話、對文件本身下註解、用口語打比方）在 M0–M13 是刻意的，
那裡要降低進入門檻。但同樣的寫法搬到研究指引頁就變成不專業。
**新增或改寫研究指引頁時，一律用下面的標準。**

### 三類要避免的寫法

**① 對文件本身下註解。** 寫主題，不要寫「這一頁在做什麼」。

```
✗ 這一頁不是教材。
✓ 本頁為研究指引，預設讀者已完成上篇。

✗ 但「餵進同一個混合模型」這句話本身沒有任何資訊量。
✓ 「進入同一個混合模型」一語尚未指明任何機制。

✗ 這一節講的是不用任何長讀關係、只靠一維頻率譜做重建的標準做法。
✓ 以下建立不使用任何長讀關係、僅以一維頻率譜重建的標準流程。

✗ 接下來三節就是逐一補這三格。／這一節回答「怎麼融入」。
✓ （刪掉。標題已經說了，句子本身沒有內容。）
```

**② 對讀者說話。** 不用第二人稱，也不用「我們」。

```
✗ 假設你手上有一份腫瘤樣本、幾千個 somatic 變異。
✓ 設一份腫瘤樣本含數千個 somatic 變異。

✗ 難處在圖的中間那一格。我們手上沒有那棵樹。
✓ 困難在於中間一格：觀測資料不包含該樹。

✗ 這件事的量級可以自己算一遍，算完就知道為什麼 k 幾乎都是 2 或 3。
✓ 以下估算此量級，並據以說明 k 為何幾乎恆為 2 或 3。
```

**③ 口語措辭與評價性字眼。** 換成技術描述。

| 不要 | 改成 |
|---|---|
| φ 與 K 互相吃 | φ 與 K 不可區辨 |
| 錯掉的變異會把群染髒 | 受影響的變異將汙染群的組成 |
| 不是某個數字的小數點 | 而非參數的數值 |
| 好消息是…／壞消息是… | 可容許之處…／限制… |
| 這條路線最強的賣點 | 此路線的主要論據 |
| 照單全收、打架、卡住、冒出、全滅 | 直接採用、衝突、受限、出現、全數不通過 |
| 綽綽有餘、差得很遠、少得離譜 | 充足、相去甚遠、遠低於預期 |
| 一口氣、拍板的常數、值得停一下 | 於單次事件中、任意設定的常數、（刪） |

**標題也算。** 疑問句與敘事句改成名詞片語：

```
✗ 那要不要保留標籤？              ✓ 標籤的取捨
✗ 那這條路線的「頻率譜」長什麼樣？  ✓ 單倍型頻率譜的形式
✗ 而這個門檻，短讀剛好卡在上面      ✓ 短讀相對於此門檻的位置
✗ 一個具體的例子                  ✓ 數值例
```

### 圖也要一起改

`{{svg:… | 圖說}}` 的圖說是正文，`.svg` 裡的 `<text>` 標籤與 `<desc>` 也是。
改頁面時這三處要一起改，否則會出現「內文很正式、圖上寫著『軟體給你』」的落差。
`<desc>` 是螢幕閱讀器唯一讀得到的版本，不要漏。

### 改寫時不要動到內容

語體改寫很容易順手改掉數字或刪掉一個 `[[術語]]` 連結，而且不會有錯誤訊息。
改完用這段確認六類資產完全一致：

```bash
python3 - <<'PY'
import re, subprocess
F = 'src/modules/sr2-implementation.html'          # 換成你改的檔
def ex(t): return {
 'svg':   sorted(re.findall(r'\{\{svg:([a-z0-9-]+)', t)),
 'widget':sorted(re.findall(r'\{\{widget:([a-z0-9-]+)', t)),
 'guard': sorted(re.findall(r'\{\{guard:(\d+)\s*\|\s*([^}]*)\}\}', t)),
 'quiz':  sorted(re.findall(r'\{\{quiz:(\w+)\}\}', t)),
 'terms': sorted(set(re.findall(r'\[\[([^\]]+)\]\]', t))),
 'links': sorted(re.findall(r'href="([^"]+)"', t)),
 'nums':  sorted(set(re.findall(r'\d[\d,\.]*%?', t)))}
a = ex(subprocess.run(['git','show',f'HEAD:{F}'],capture_output=True,text=True).stdout)
b = ex(open(F).read())
print('✓ 一致' if a == b else [k for k in a if a[k] != b[k]])
PY
```

然後掃一次殘留（兩頁都應該是零命中）：

```bash
grep -nE '你|我們|好消息|壞消息|照單全收|打架|染髒|全滅|離譜|卡住|冒出|躲不掉|一口氣|小數點|賣點|長什麼樣|說白了|值得停|這一頁不是|這一節講|沒有任何資訊量' \
  src/modules/sr*.html src/svg/sr*.svg
```

> 這些規則是使用者在 sr1／sr2 上實際提出的意見所整理出來的，
> 不是通則。M0–M13 **不要**照這套改 —— 那裡的口語是刻意的。

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
