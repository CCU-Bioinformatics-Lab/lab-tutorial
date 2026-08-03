/* ============================================================================
   cis-trans-drug — 事件清單相同，分子關係可能不同
   ----------------------------------------------------------------------------
   M0 刻意不要求學生先背 cis/trans。互動先用「同一份 DNA／分別位於兩份 DNA」
   建立關聯查詢的直覺，再由後續模組補正式術語。

   契約：init / render / reset / check / getState / setState
   ============================================================================ */
/* eslint-env browser */
'use strict';

TW.define('cis-trans-drug', function (root, cfg) {

  var LOCI = [
    { x: 330, name: '改變 A', code: 'T790M' },
    { x: 690, name: '改變 B', code: 'C797S' }
  ];

  var model = null;
  var stage = root.querySelector('.widget__stage');

  /* ---- 產生資料 -------------------------------------------------------- */

  function build() {
    var rnd = TW.rng(cfg.seed);
    /* 種子決定這次是 cis 還是 trans —— 同一個學生每次看到的都一樣，
       但不同 widget id 會拿到不同情境。 */
    var isCis = cfg.force ? (cfg.force === 'cis') : (rnd() < 0.5);

    var reads = [];
    var n = 11;
    for (var i = 0; i < n; i++) {
      var x0 = 100 + Math.floor(rnd() * 60);
      var x1 = 860 + Math.floor(rnd() * 50);
      var covA = x0 < LOCI[0].x - 8 && x1 > LOCI[0].x + 8;
      var covB = x0 < LOCI[1].x - 8 && x1 > LOCI[1].x + 8;

      var a, b;
      if (isCis) {
        /* cis：突變都在同一條分子上 → 一條 read 要嘛兩個都有，要嘛都沒有 */
        var mut = rnd() < 0.45;
        a = mut ? 1 : 0;
        b = mut ? 1 : 0;
      } else {
        /* trans：兩個突變分屬不同分子 → 一條 read 最多只帶一個 */
        var r = rnd();
        if (r < 0.42) { a = 1; b = 0; }
        else if (r < 0.84) { a = 0; b = 1; }
        else { a = 0; b = 0; }
      }
      reads.push({ x0: x0, x1: x1, a: covA ? a : null, b: covB ? b : null });
    }

    return { isCis: isCis, reads: reads, pick: null, checked: false };
  }

  /* ---- 繪圖 ------------------------------------------------------------ */

  function paint() {
    var H = 60 + model.reads.length * 22 + 46;
    var svg = TW.stage(stage, H, {
      title: '跨越兩個 DNA 改變位置的 read',
      desc: '每一條橫線是一個來自單一 DNA 分子的定序片段。兩個垂直虛線是改變 A 與改變 B 的位置。' +
            '實心紅點代表這條 read 在該位置帶有突變，空心點代表是參考序列。' +
            (model.checked
              ? (model.isCis ? '多條跨越兩點的 read 都同時帶有 A 與 B，支持兩者在同一份 DNA 上。'
                             : '多條跨越兩點的 read 穩定地只帶 A 或只帶 B，支持兩者分別位於兩份 DNA 上。')
              : '請判斷兩個改變在同一份 DNA、分別位於兩份 DNA，或現有資料不足。')
    });

    /* 位點標題與導引線 */
    LOCI.forEach(function (L) {
      TW.svg('line', { 'class': 'guide', x1: L.x, y1: 34, x2: L.x, y2: 46 + model.reads.length * 22 + 8 }, svg);
      TW.text(L.x, 22, L.name, 'lbl bold mid somatic zh', svg);
      TW.text(L.x, 42, L.code, 'tick mid mono', svg);
    });

    /* reads */
    model.reads.forEach(function (r, i) {
      var y = 58 + i * 22;
      TW.svg('rect', {
        'class': 'read', x: r.x0, y: y, width: r.x1 - r.x0, height: 14, rx: 7
      }, svg);

      LOCI.forEach(function (L, k) {
        var v = k === 0 ? r.a : r.b;
        if (v === null) return;
        TW.svg('circle', {
          'class': 'mark ' + (v ? 'somatic' : 'ref'),
          cx: L.x, cy: y + 7, r: 6
        }, svg);
      });
    });

    /* 揭曉後畫出 haplotype 歸屬 */
    if (model.checked) {
      var yBase = 58 + model.reads.length * 22 + 14;
      TW.text(100, yBase + 8, model.isCis
        ? '多條跨越兩點的 read 都有 A + B → 支持「同一份 DNA」'
        : '多條跨越兩點的 read 穩定呈現 A-only / B-only → 支持「分別位於兩份 DNA」',
        'anno zh ' + (model.isCis ? 'somatic' : 'germline'), svg);
    }
  }

  /* ---- 控制列：把選項按鈕插進標準控制列 -------------------------------- */

  function mountControls() {
    var ctl = root.querySelector('.widget__ctl');
    var seg = document.createElement('span');
    seg.className = 'wseg';
    seg.innerHTML =
      '<button type="button" data-pick="same" aria-pressed="false">同一份 DNA</button>' +
      '<button type="button" data-pick="separate" aria-pressed="false">分別位於兩份 DNA</button>' +
      '<button type="button" data-pick="unknown" aria-pressed="false">資訊不足</button>';
    ctl.insertBefore(seg, ctl.firstChild);

    seg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pick]');
      if (!b) return;
      model.pick = b.getAttribute('data-pick');
      syncPick();
    });
  }

  function syncPick() {
    root.querySelectorAll('[data-pick]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-pick') === model.pick));
    });
  }

  /* ---- 契約 ------------------------------------------------------------ */

  return {
    init: function () {
      model = build();
      mountControls();
    },

    render: function () { paint(); syncPick(); },

    /* 重來只清掉使用者的作答，不重抽題目 —— 否則「重來」會變成「換一題」 */
    reset: function () { model.pick = null; model.checked = false; },

    check: function () {
      if (!model.pick) {
        return { ok: false, message: '請先選擇一項結論' };
      }
      var answer = model.isCis ? 'same' : 'separate';
      var ok = model.pick === answer;
      model.checked = true;
      paint();

      var msg = ok
        ? (model.isCis
            ? '✓ 正確：多條能同時觀察兩點的 read 都帶 A + B，支持同一份 DNA'
            : '✓ 正確：read 都能同時觀察兩點，卻穩定分成 A-only 與 B-only，支持兩者分別位於兩份 DNA')
        : (model.pick === 'unknown'
            ? '✗ 這裡的 read 都完整跨過兩點，因此不是資訊不足；請比較兩個位置的 allele 組合'
            : '✗ 再看一次：同一條橫線上的兩個位置，是一起為實心，還是穩定地一次只出現一個？');

      return { ok: ok, score: ok ? 1 : 0, message: msg };
    },

    getState: function () { return { pick: model.pick, checked: model.checked }; },

    setState: function (s) {
      if (!s) return;
      /* 相容舊版頁面已存在 localStorage 的 cis/trans 作答。 */
      model.pick = s.pick === 'cis' ? 'same' : (s.pick === 'trans' ? 'separate' : (s.pick || null));
      model.checked = !!s.checked;
    }
  };
});
