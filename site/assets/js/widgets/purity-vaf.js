/* ============================================================================
   purity-vaf — 拉 purity，看 VAF 怎麼變（而且不是線性的）
   ----------------------------------------------------------------------------
   這個元件存在的唯一目的，是把「VAF ≠ 帶有突變的細胞比例」變成肌肉記憶。
   學生可以親手把 copy number 拉到 3、把 multiplicity 拉到 2，
   然後看到同一個 purity 給出完全不同的 VAF。

        VAF = purity × multiplicity / ( purity × totalCN + (1 - purity) × 2 )

   分母是關鍵：腫瘤細胞貢獻 totalCN 份 allele，正常細胞貢獻 2 份。
   這也是 tumor cellular purity 與 tumor DNA fraction 分家的地方。
   ============================================================================ */
/* eslint-env browser */
'use strict';

TW.define('purity-vaf', function (root, cfg) {

  var st = { purity: 0.5, cn: 2, mult: 1, ccf: 1.0 };
  var stage = root.querySelector('.widget__stage');

  function vaf(p, cn, m, ccf) {
    var tumourAlleles = p * cn;
    var normalAlleles = (1 - p) * 2;
    if (tumourAlleles + normalAlleles === 0) return 0;
    return (p * m * ccf) / (tumourAlleles + normalAlleles);
  }

  /* tumor DNA fraction：腫瘤貢獻的 DNA 佔全部的比例。
     只有在 cn === 2 時才會等於 cellular purity —— 這正是 guardrail #2。 */
  function dnaFraction(p, cn) {
    var t = p * cn, n = (1 - p) * 2;
    return t / (t + n);
  }

  function paint() {
    var H = 330;
    var svg = TW.stage(stage, H, {
      title: 'tumor purity 與 VAF 的關係曲線',
      desc: '橫軸是 tumor purity 0 到 1，縱軸是預期 VAF。灰色虛線是「VAF = purity」的簡化假設，' +
            '藍色實線是依目前參數計算的關係。在 diploid、單一拷貝、clonal 條件下，實際 VAF 為 purity 的一半（固定比例，而非固定差值）。'
    });

    var L = 90, R = 690, T = 40, B = 260;

    /* 座標軸 */
    TW.svg('path', { 'class': 'axis', d: 'M' + L + ',' + T + ' L' + L + ',' + B + ' L' + R + ',' + B }, svg);
    for (var i = 0; i <= 5; i++) {
      var xv = i / 5;
      var x = L + xv * (R - L);
      var y = B - xv * (B - T);
      TW.svg('line', { 'class': 'guide', x1: x, y1: T, x2: x, y2: B }, svg);
      TW.svg('line', { 'class': 'guide', x1: L, y1: y, x2: R, y2: y }, svg);
      TW.text(x, B + 22, xv.toFixed(1), 'tick mid', svg);
      TW.text(L - 12, y + 5, xv.toFixed(1), 'tick end', svg);
    }
    TW.text((L + R) / 2, B + 46, 'tumor purity', 'anno mid', svg);
    var yl = TW.text(0, 0, 'VAF', 'anno mid', svg);
    yl.setAttribute('transform', 'translate(' + (L - 52) + ',' + ((T + B) / 2) + ') rotate(-90)');

    /* 簡化假設 VAF = purity */
    TW.svg('line', {
      'class': 'guide', x1: L, y1: B, x2: R, y2: T,
      style: 'stroke-dasharray:6 5'
    }, svg);
    TW.text(R - 6, T + 16, 'VAF = purity（簡化直覺）', 'tick end', svg);

    /* 實際曲線 */
    var pts = [];
    for (var k = 0; k <= 100; k++) {
      var p = k / 100;
      var v = vaf(p, st.cn, st.mult, st.ccf);
      pts.push((L + p * (R - L)).toFixed(1) + ',' + (B - Math.min(1, v) * (B - T)).toFixed(1));
    }
    TW.svg('path', { 'class': 'flow', d: 'M' + pts.join(' L'), style: 'stroke-width:3' }, svg);

    /* 目前的點 */
    var cv = vaf(st.purity, st.cn, st.mult, st.ccf);
    var cx = L + st.purity * (R - L);
    var cy = B - Math.min(1, cv) * (B - T);
    TW.svg('line', { 'class': 'guide somatic', x1: cx, y1: cy, x2: cx, y2: B }, svg);
    TW.svg('line', { 'class': 'guide somatic', x1: L, y1: cy, x2: cx, y2: cy }, svg);
    TW.svg('circle', { 'class': 'pt tp', cx: cx, cy: cy, r: 8 }, svg);

    /* 右側讀數 */
    var X = 730;
    TW.svg('rect', { 'class': 'box', x: X - 16, y: T - 6, width: 286, height: 232, rx: 8 }, svg);

    var rows = [
      ['tumor cellular purity', st.purity.toFixed(2), ''],
      ['tumor DNA fraction', dnaFraction(st.purity, st.cn).toFixed(2),
        st.cn === 2 ? 'hp1' : 'somatic'],
      ['total copy number', String(st.cn), ''],
      ['mutation multiplicity', String(st.mult), ''],
      ['cancer cell fraction', st.ccf.toFixed(2), ''],
      ['預期 VAF', cv.toFixed(3), 'som']
    ];
    rows.forEach(function (r, i) {
      var y = T + 22 + i * 36;
      TW.text(X, y, r[0], 'tick', svg);
      var t = TW.text(X + 262, y + 2, r[1], 'lbl end bold mono ' + (r[2] || ''), svg);
      t.style.fontSize = '21px';
    });

    if (st.cn !== 2) {
      TW.text(X, T + 222, 'CN ≠ 2 → purity 與 DNA fraction 分家', 'tick somatic zh', svg);
    }

    /* 底部提示 */
    TW.text(L, 306,
      st.cn === 2 && st.mult === 1 && st.ccf === 1
        ? 'diploid、單拷貝、clonal：VAF 為 purity 的一半，這是此條件組合下的特例。'
        : '目前曲線不再是 purity 的一半；實際資料中 CN 與 multiplicity 往往需由其他證據估計。',
      'tick zh', svg);
  }

  function mountControls() {
    var ctl = root.querySelector('.widget__ctl');
    var box = document.createElement('span');
    box.style.cssText = 'display:flex;flex-wrap:wrap;gap:.4rem 1rem;flex:1';
    box.innerHTML =
      '<label class="wctl">purity <input type="range" min="0" max="1" step="0.01" value="0.5" data-k="purity"><output>0.50</output></label>' +
      '<label class="wctl">total CN <input type="range" min="1" max="6" step="1" value="2" data-k="cn"><output>2</output></label>' +
      '<label class="wctl">multiplicity <input type="range" min="1" max="4" step="1" value="1" data-k="mult"><output>1</output></label>' +
      '<label class="wctl">CCF <input type="range" min="0.1" max="1" step="0.05" value="1" data-k="ccf"><output>1.00</output></label>';
    ctl.insertBefore(box, ctl.firstChild);

    box.addEventListener('input', function (e) {
      var i = e.target;
      if (!i.getAttribute) return;
      var k = i.getAttribute('data-k');
      if (!k) return;
      st[k] = parseFloat(i.value);
      /* multiplicity 不能超過 total copy number */
      if (st.mult > st.cn) { st.mult = st.cn; }
      sync();
      paint();
    });
  }

  function sync() {
    root.querySelectorAll('[data-k]').forEach(function (i) {
      var k = i.getAttribute('data-k');
      i.value = st[k];
      var o = i.parentNode.querySelector('output');
      if (o) o.textContent = (k === 'cn' || k === 'mult') ? String(st[k]) : st[k].toFixed(2);
    });
  }

  return {
    init: function () { mountControls(); },
    render: function () { sync(); paint(); },
    reset: function () { st = { purity: 0.5, cn: 2, mult: 1, ccf: 1.0 }; },

    check: function () {
      var v = vaf(st.purity, st.cn, st.mult, st.ccf);
      var naive = st.purity;
      var ratio = naive > 0 ? v / naive : 0;
      return {
        ok: true, score: 1,
        message: '目前 VAF = ' + v.toFixed(3) + '，是簡化假設（' + naive.toFixed(2) +
                 '）的 ' + ratio.toFixed(2) + ' 倍'
      };
    },

    getState: function () { return { st: st }; },
    setState: function (s) { if (s && s.st) st = s.st; }
  };
});
