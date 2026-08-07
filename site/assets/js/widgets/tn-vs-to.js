/* ============================================================================
   tn-vs-to — 拿掉配對正常樣本之後，哪些 false positive 變得無法排除
   ----------------------------------------------------------------------------
   一個開關，兩種世界。這是 Deck B 與 Deck D 整篇論文的立論起點，
   用一個切換就能講完。

   四類候選點：
     · 真 somatic          → 兩種模式都留得住
     · 常見 germline       → TN 用 normal 排除；TO 用 PON 排除（有效）
     · 私有 germline       → TN 排得掉；TO 排不掉  ★ 核心缺口
     · 新的定序 artifact   → TN 多半排得掉；TO 排不掉 ★ 核心缺口
   ============================================================================ */
/* eslint-env browser */
'use strict';

TW.define('tn-vs-to', function (root, cfg) {

  var KINDS = [
    { k: 'somatic', zh: '真 somatic 變異', cls: 'somatic', n: 6, tn: 'keep', to: 'keep' },
    { k: 'common', zh: '常見 germline', cls: 'germline', n: 5, tn: 'drop', to: 'drop' },
    { k: 'private', zh: '私有 germline', cls: 'germline', n: 3, tn: 'drop', to: 'stuck' },
    { k: 'artifact', zh: '新的定序 artifact', cls: 'artifact', n: 4, tn: 'drop', to: 'stuck' }
  ];

  var st = { mode: 'tn' };
  var stage = root.querySelector('.widget__stage');

  /* --- 版面座標（0 0 1000 500）--------------------------------------------
     三欄：候選（左，x 20–200）→ 過濾器（中，x 340–560）→ 保留（右，x 620–）。
     每類自己一列，列高 62；「類別名稱」放在方塊列的正上方，不再壓到中間的
     過濾器方框，連線也就不會從字上穿過去。 */
  var COL_L = 20, COL_R = 620, MARK = 22, PITCH = 30;
  var BOX_X = 340, BOX_W = 220, BOX_Y = 44, BOX_H = 344;
  var ROW0 = 168, ROW_H = 62;

  function paint() {
    var isTN = st.mode === 'tn';
    var svg = TW.stage(stage, 500, {
      title: (isTN ? '配對腫瘤－正常' : '僅腫瘤') + '模式下的候選點命運',
      desc: '每個方塊是一個候選變異。左欄是 caller 產生的候選，右欄是過濾後留下來的。' +
            (isTN ? '有配對正常樣本時，germline 與多數 artifact 都能被排除。'
                  : '僅有 PON 時，未被資料庫涵蓋的私有 germline 與 artifact 可能仍保留為候選，需要額外證據判讀。')
    });

    /* 欄標題 */
    TW.text(COL_L, 26, '候選變異（caller 輸出）', 'lbl bold zh', svg);
    TW.text(COL_R, 26, isTN ? '用配對 normal 過濾後' : '用 PON 過濾後', 'lbl bold zh', svg);

    /* 中間的過濾器。文字只佔方框上緣，下面留給四列連線穿過。 */
    TW.svg('rect', {
      'class': 'box ' + (isTN ? 'accent' : 'warn'),
      x: BOX_X, y: BOX_Y, width: BOX_W, height: BOX_H, rx: 8
    }, svg);
    var cx = BOX_X + BOX_W / 2;
    TW.text(cx, 84, isTN ? 'matched normal' : 'Panel of Normals', 'anno mid bold zh', svg);
    TW.text(cx, 110, isTN ? '這個病人自己的' : '族群資料庫', 'tick mid zh', svg);
    TW.text(cx, 132, isTN ? '正常組織' : '1000G · gnomAD …', 'tick mid', svg);

    var stuck = 0;

    KINDS.forEach(function (kind, r) {
      var fate = isTN ? kind.tn : kind.to;
      var top = ROW0 + r * ROW_H;          /* 方塊列的上緣 */
      var mid = top + MARK / 2;            /* 連線與列內文字的中線 */
      var tone = kind.cls;                 /* somatic / germline / artifact */

      /* 類別名稱：放在方塊列正上方，永遠留在左欄之內 */
      TW.text(COL_L, top - 10, kind.zh + '（' + kind.n + ' 個）', 'tick zh ' + tone, svg);

      /* 左：候選 */
      for (var i = 0; i < kind.n; i++) {
        TW.svg('rect', {
          'class': 'mark ' + tone, x: COL_L + i * PITCH, y: top, width: MARK, height: MARK, rx: 4
        }, svg);
      }
      var leftEnd = COL_L + (kind.n - 1) * PITCH + MARK;

      /* 連線：排除的停在方框左緣，留下的一路穿過方框到右欄。
         顏色走 class（.conn.somatic / .conn.bad）—— presentation attribute 裡的
         var(--x) 在 Chrome 不生效，寫 stroke="var(--bad)" 會靜靜退回類別預設色。 */
      TW.svg('line', {
        'class': fate === 'drop' ? 'guide'
               : 'conn ' + (fate === 'stuck' ? 'bad' : 'somatic'),
        x1: leftEnd + 8, y1: mid,
        x2: fate === 'drop' ? BOX_X - 4 : COL_R - 4, y2: mid,
        /* --somatic 與 --bad 幾乎同一個紅，光靠色相分不出「該留的」與
           「排不掉的」；虛線是第二個通道（灰階列印與色盲也讀得到）。 */
        'stroke-dasharray': fate === 'stuck' ? '9 6' : null,
        'marker-end': fate === 'drop' ? null : 'url(#arrow-sm)'
      }, svg);

      if (fate === 'drop') {
        TW.text(cx, mid + 6, '✗ 排除', 'tick mid bad', svg);
        return;
      }

      /* 右：過濾後仍在的候選。顏色維持類別本色，
         「排不掉」用右側的紅字標，不改方塊的色相。 */
      for (var j = 0; j < kind.n; j++) {
        TW.svg('rect', {
          'class': 'mark ' + tone, x: COL_R + j * PITCH, y: top, width: MARK, height: MARK, rx: 4
        }, svg);
      }
      var rightEnd = COL_R + (kind.n - 1) * PITCH + MARK;
      TW.text(rightEnd + 10, mid + 6,
        fate === 'stuck' ? '★ 排不掉' : '✓ 保留',
        'tick zh ' + (fate === 'stuck' ? 'bad' : 'ok'), svg);

      if (fate === 'stuck') stuck += kind.n;
    });

    /* 結果面板（放在右欄下方，對齊它所總結的那一欄） */
    var tp = KINDS[0].n;
    var fp = stuck;
    var prec = tp / (tp + fp);

    TW.svg('rect', {
      'class': 'box ' + (isTN ? 'ok' : 'bad'), x: 580, y: 412, width: 400, height: 76, rx: 8
    }, svg);
    var pt = TW.text(600, 450, 'precision ≈ ' + prec.toFixed(2), 'lbl bold mono', svg);
    pt.style.fontSize = '26px';
    TW.text(600, 476, tp + ' 個真 somatic', 'tick somatic', svg);
    TW.text(730, 476, fp + ' 個假陽性仍保留', 'tick zh ' + (fp ? 'bad' : 'ok'), svg);

    /* 註解（左下角，兩行，寬度控制在 540 以內才不會撞到面板） */
    var note = isTN
      ? ['有配對 normal 時，這個病人「私有的」germline',
         '變異也能在正常組織裡看到，因此可一併排除。']
      : ['★ PON 是族群資料庫，未涵蓋這個病人私有的 germline，',
         '也未涵蓋未曾見過的 artifact；這些仍是候選假陽性。'];
    TW.text(COL_L, 442, note[0], 'anno zh' + (isTN ? '' : ' bad'), svg);
    TW.text(COL_L, 468, note[1], 'anno zh' + (isTN ? '' : ' bad'), svg);
  }

  function mountControls() {
    var ctl = root.querySelector('.widget__ctl');
    var seg = document.createElement('span');
    seg.className = 'wseg';
    seg.innerHTML =
      '<button type="button" data-m="tn" aria-pressed="true">配對腫瘤－正常</button>' +
      '<button type="button" data-m="to" aria-pressed="false">僅腫瘤</button>';
    ctl.insertBefore(seg, ctl.firstChild);
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-m]');
      if (!b) return;
      st.mode = b.getAttribute('data-m');
      sync(); paint();
    });
  }

  function sync() {
    root.querySelectorAll('[data-m]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-m') === st.mode));
    });
  }

  return {
    init: function () { mountControls(); },
    render: function () { sync(); paint(); },
    reset: function () { st.mode = 'tn'; },
    check: function () {
      var seen = st.mode === 'to';
      return {
        ok: seen, score: seen ? 1 : 0,
        message: seen
          ? '✓ 可見：7 個原本可排除的候選點在僅腫瘤模式下仍無法排除，precision 從 1.00 降至 0.46'
          : '請切換至僅腫瘤模式，觀察哪些候選點變得無法排除'
      };
    },
    getState: function () { return { mode: st.mode }; },
    setState: function (s) { if (s && s.mode) st.mode = s.mode; }
  };
});
