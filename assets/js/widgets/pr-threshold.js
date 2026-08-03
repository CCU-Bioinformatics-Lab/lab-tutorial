/* ============================================================================
   pr-threshold — 拉門檻，看 precision / recall / F1 怎麼互相拉扯
   ----------------------------------------------------------------------------
   刻意內建 Deck C 的真實情況：資料裡 FN 遠多於 FP。
   學生會親眼看到「precision 明顯上升，但 F1 幾乎不動」——
   這正是 Deck C 結果那幾頁在解釋的事，也是 guardrail #10。
   ============================================================================ */
/* eslint-env browser */
'use strict';

TW.define('pr-threshold', function (root, cfg) {

  var st = { thr: 0.5, missed: cfg.missed === undefined ? 90 : cfg.missed };
  var stage = root.querySelector('.widget__stage');
  var data = null;

  /* 兩個重疊的分數分布：真 somatic 偏右、假陽性偏左但尾巴很長。
     尾巴是重點 —— 它代表「長得跟真的一模一樣」的那批假陽性。 */
  function build() {
    var rnd = TW.rng(cfg.seed || 7);
    var pos = [], neg = [];
    for (var i = 0; i < 200; i++) pos.push(clamp(beta(rnd, 5.5, 1.9)));
    for (var j = 0; j < 120; j++) neg.push(clamp(beta(rnd, 2.0, 3.4)));
    /* 刻意加一批「高分假陽性」：Deck C 分數 0.9 以上仍有 952 個 FP */
    for (var k = 0; k < 26; k++) neg.push(clamp(0.9 + rnd() * 0.1));
    return { pos: pos, neg: neg };
  }
  function beta(rnd, a, b) {
    var x = 0, y = 0;
    for (var i = 0; i < a; i++) x -= Math.log(1 - rnd());
    for (var j = 0; j < b; j++) y -= Math.log(1 - rnd());
    return x / (x + y);
  }
  function clamp(v) { return Math.max(0.001, Math.min(0.999, v)); }

  function metrics(t) {
    var tp = data.pos.filter(function (v) { return v >= t; }).length;
    var fp = data.neg.filter(function (v) { return v >= t; }).length;
    var fnKept = data.pos.length - tp;
    /* missed = caller 一開始就沒找到的 —— 後處理救不回來，但會計進 recall 分母 */
    var fn = fnKept + st.missed;
    var precision = tp + fp ? tp / (tp + fp) : 0;
    var recall = tp + fn ? tp / (tp + fn) : 0;
    var f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
    return { tp: tp, fp: fp, fn: fn, precision: precision, recall: recall, f1: f1 };
  }

  function paint() {
    var m = metrics(st.thr);
    var svg = TW.stage(stage, 360, {
      title: '分數分布與門檻造成的 precision / recall 取捨',
      desc: '上方直方圖是模型輸出分數的分布，紅色是真 somatic、紫色是假陽性。' +
            '垂直線是目前門檻，右側顯示對應的 precision、recall 與 F1。'
    });

    var L = 70, R = 640, T = 40, B = 210, NB = 24;

    /* 直方圖 */
    var hp = new Array(NB).fill(0), hn = new Array(NB).fill(0);
    data.pos.forEach(function (v) { hp[Math.min(NB - 1, Math.floor(v * NB))]++; });
    data.neg.forEach(function (v) { hn[Math.min(NB - 1, Math.floor(v * NB))]++; });
    var maxH = Math.max.apply(null, hp.concat(hn));

    var bw = (R - L) / NB;
    for (var i = 0; i < NB; i++) {
      var x = L + i * bw;
      if (hn[i]) {
        TW.svg('rect', {
          'class': 'bar artifact', x: x, y: B - (hn[i] / maxH) * (B - T),
          width: bw - 1, height: (hn[i] / maxH) * (B - T)
        }, svg);
      }
      if (hp[i]) {
        TW.svg('rect', {
          'class': 'bar somatic', x: x + bw * 0.28, y: B - (hp[i] / maxH) * (B - T),
          width: bw * 0.72 - 1, height: (hp[i] / maxH) * (B - T)
        }, svg);
      }
    }

    TW.svg('path', { 'class': 'axis', d: 'M' + L + ',' + T + ' L' + L + ',' + B + ' L' + R + ',' + B }, svg);
    for (var k = 0; k <= 5; k++) {
      var xv = k / 5, xx = L + xv * (R - L);
      TW.text(xx, B + 20, xv.toFixed(1), 'tick mid', svg);
    }
    TW.text((L + R) / 2, B + 44, '模型輸出分數', 'anno mid zh', svg);

    /* 門檻線 */
    var tx = L + st.thr * (R - L);
    TW.svg('line', { 'class': 'axis', x1: tx, y1: T - 12, x2: tx, y2: B + 6, stroke: 'var(--accent)', 'stroke-width': 3 }, svg);
    TW.text(tx, T - 18, '門檻 ' + st.thr.toFixed(2), 'tick mid bold', svg);
    TW.svg('rect', { 'class': 'region bad', x: L, y: T, width: tx - L, height: B - T }, svg);
    TW.text(L + 8, T + 16, '← 被過濾掉', 'tick', svg);

    /* 圖例 */
    TW.svg('rect', { 'class': 'bar somatic', x: L, y: B + 56, width: 16, height: 12 }, svg);
    TW.text(L + 22, B + 66, '真 somatic', 'tick zh', svg);
    TW.svg('rect', { 'class': 'bar artifact', x: L + 110, y: B + 56, width: 16, height: 12 }, svg);
    TW.text(L + 132, B + 66, '假陽性', 'tick zh', svg);

    /* 讀數 */
    var X = 690;
    TW.svg('rect', { 'class': 'box', x: X - 12, y: T - 20, width: 300, height: 250, rx: 8 }, svg);

    [['precision', m.precision, 'ok'], ['recall', m.recall, 'hp1'], ['F1', m.f1, 'som']]
      .forEach(function (r, i) {
        var y = T + 16 + i * 62;
        TW.text(X, y, r[0], 'anno', svg);
        var t = TW.text(X + 276, y + 6, r[1].toFixed(3), 'lbl end bold mono ' + r[2], svg);
        t.setAttribute('font-size', '28');
        TW.svg('rect', { 'class': 'box plain', x: X, y: y + 14, width: 276, height: 8, rx: 4 }, svg);
        TW.svg('rect', {
          'class': 'bar ' + (r[2] === 'ok' ? 'somatic' : r[2] === 'hp1' ? 'hp1' : 'hp2'),
          x: X, y: y + 14, width: Math.max(2, 276 * r[1]), height: 8, rx: 4
        }, svg);
      });

    TW.text(X, T + 206, 'TP ' + m.tp + ' · FP ' + m.fp + ' · FN ' + m.fn, 'tick mono', svg);
    TW.text(X, T + 226, '其中 ' + st.missed + ' 個 FN 是 caller 一開始就漏掉的', 'tick zh bad', svg);

    TW.text(20, 344,
      '將門檻由 0.5 調至 0.9：precision 明顯上升，但 F1 幾乎不變 —— ' +
      '因為 FN 的數量主要來自 caller 未輸出的變異；僅對既有候選進行後處理時，無法恢復這些 FN。',
      'anno zh', svg);
  }

  function mountControls() {
    var ctl = root.querySelector('.widget__ctl');
    var box = document.createElement('span');
    box.style.cssText = 'display:flex;gap:1rem;flex-wrap:wrap;flex:1';
    box.innerHTML =
      '<label class="wctl">門檻 <input type="range" min="0" max="0.99" step="0.01" value="0.5" data-k="thr"><output>0.50</output></label>' +
      '<label class="wctl">caller 漏掉的變異數 <input type="range" min="0" max="200" step="10" value="' +
      st.missed + '" data-k="missed"><output>' + st.missed + '</output></label>';
    ctl.insertBefore(box, ctl.firstChild);
    box.addEventListener('input', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-k');
      if (!k) return;
      st[k] = parseFloat(e.target.value);
      sync(); paint();
    });
  }

  function sync() {
    root.querySelectorAll('[data-k]').forEach(function (i) {
      var k = i.getAttribute('data-k');
      i.value = st[k];
      var o = i.parentNode.querySelector('output');
      if (o) o.textContent = k === 'thr' ? st[k].toFixed(2) : String(st[k]);
    });
  }

  return {
    init: function () { data = build(); mountControls(); },
    render: function () { sync(); paint(); },
    reset: function () { st.thr = 0.5; st.missed = 90; },
    check: function () {
      var a = metrics(0.5), b = metrics(0.9);
      var dP = b.precision - a.precision, dF = b.f1 - a.f1;
      return {
        ok: st.thr >= 0.85,
        score: st.thr >= 0.85 ? 1 : 0,
        message: st.thr >= 0.85
          ? '✓ 門檻 0.5 → 0.9：precision +' + dP.toFixed(3) + '，但 F1 只有 ' +
            (dF >= 0 ? '+' : '') + dF.toFixed(3)
          : '請將門檻調至約 0.9，比較 precision 與 F1 的變化'
      };
    },
    getState: function () { return { thr: st.thr, missed: st.missed }; },
    setState: function (s) { if (s) { if (s.thr !== undefined) st.thr = s.thr; if (s.missed !== undefined) st.missed = s.missed; } }
  };
});
