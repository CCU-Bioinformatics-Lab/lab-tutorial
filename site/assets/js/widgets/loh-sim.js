/* ============================================================================
   loh-sim — copy-loss LOH 與 copy-neutral LOH 的差別
   ----------------------------------------------------------------------------
   教學重點只有一個：兩者在 heterozygosity 上完全一樣（都變成 0），
   但在 coverage 上一個掉一半、一個完全看不出來。

   所以「只看 coverage」會漏掉一半的 LOH —— 這正是 LongPhase-TO 改用
   heterozygosity ratio 偵測的理由。
   ============================================================================ */
/* eslint-env browser */
'use strict';

TW.define('loh-sim', function (root, cfg) {

  var MODES = {
    normal: { label: '正常', hp1: 1, hp2: 1 },
    loss: { label: 'Copy-loss LOH', hp1: 1, hp2: 0 },
    neutral: { label: 'Copy-neutral LOH', hp1: 2, hp2: 0 },
    gain: { label: 'Copy gain（非 LOH）', hp1: 2, hp2: 1 }
  };

  var st = { mode: 'normal' };
  var stage = root.querySelector('.widget__stage');

  function paint() {
    var m = MODES[st.mode];
    var totalCN = m.hp1 + m.hp2;
    var het = (m.hp1 > 0 && m.hp2 > 0) ? 1 : 0;

    var svg = TW.stage(stage, 330, {
      title: MODES[st.mode].label + ' 的染色體、coverage 與 heterozygosity',
      desc: '左側畫出這個狀態下 HP1 與 HP2 各有幾份拷貝，右側顯示對應的 coverage 與 heterozygosity ratio。'
    });

    /* ── 左：染色體 ─────────────────────────────────────────── */
    TW.text(20, 26, '細胞裡的染色體', 'lbl bold zh', svg);

    var y0 = 50;
    var drawn = 0;
    for (var i = 0; i < m.hp1; i++) {
      TW.svg('rect', { 'class': 'chr hp1', x: 40 + drawn * 60, y: y0, width: 40, height: 150, rx: 18 }, svg);
      TW.text(60 + drawn * 60, y0 + 172, 'HP1', 'tick mid hp1 bold', svg);
      drawn++;
    }
    for (var j = 0; j < m.hp2; j++) {
      TW.svg('rect', { 'class': 'chr hp2', x: 40 + drawn * 60, y: y0, width: 40, height: 150, rx: 18 }, svg);
      TW.text(60 + drawn * 60, y0 + 172, 'HP2', 'tick mid hp2 bold', svg);
      drawn++;
    }
    /* 被丟掉的用虛線畫出來 */
    if (m.hp2 === 0) {
      TW.svg('rect', { 'class': 'chr lost', x: 40 + drawn * 60, y: y0, width: 40, height: 150, rx: 18 }, svg);
      TW.text(60 + drawn * 60, y0 + 172, 'HP2 已失去', 'tick mid zh', svg);
      TW.svg('line', {
        'class': 'conn bad', x1: 46 + drawn * 60, y1: y0 + 8, x2: 114 + drawn * 60 - 60, y2: y0 + 142,
        style: 'stroke-width:3'
      }, svg);
    }

    /* ── 中：coverage ──────────────────────────────────────── */
    var CX = 400;
    TW.text(CX, 26, 'Coverage', 'lbl bold', svg);
    var covH = totalCN / 2 * 100;
    TW.svg('line', { 'class': 'guide', x1: CX, y1: 150, x2: CX + 160, y2: 150 }, svg);
    TW.text(CX + 166, 155, '正常水準', 'tick', svg);
    TW.svg('rect', {
      'class': 'bar ' + (totalCN === 2 ? '' : totalCN < 2 ? 'somatic' : 'hp1'),
      x: CX, y: 200 - covH, width: 110, height: covH, rx: 4
    }, svg);
    var ct = TW.text(CX + 55, 224, (totalCN / 2).toFixed(1) + '×', 'lbl mid bold mono', svg);
    ct.style.fontSize = '24px';
    TW.text(CX + 55, 248, 'total CN = ' + totalCN, 'tick mid', svg);

    /* ── 右：heterozygosity ────────────────────────────────── */
    var HX = 640;
    TW.text(HX, 26, 'Heterozygosity ratio', 'lbl bold', svg);
    TW.svg('rect', { 'class': 'box plain', x: HX, y: 60, width: 320, height: 160, rx: 8 }, svg);

    var hv = TW.text(HX + 160, 132, het.toFixed(1), 'lbl mid bold mono ' + (het ? 'ok' : 'bad'), svg);
    hv.style.fontSize = '54px';
    TW.text(HX + 160, 168, het ? '兩條 haplotype 都在' : '只剩單一 haplotype', 'anno mid zh', svg);
    TW.text(HX + 160, 196, het ? '不是 LOH' : '這就是 LOH', 'anno mid zh bold ' + (het ? '' : 'bad'), svg);

    /* ── 底部結論 ──────────────────────────────────────────── */
    var note;
    if (st.mode === 'neutral') {
      note = '★ 關鍵情況：在此理想模型中，coverage 仍接近正常（2×），但 heterozygosity 已降為 0。' +
             '僅依 coverage 的方法可能漏掉這種 LOH。';
    } else if (st.mode === 'loss') {
      note = 'coverage 約降為一半，heterozygosity 也降為 0 —— 在此模型中，兩種訊號均可提示 LOH。';
    } else if (st.mode === 'gain') {
      note = 'copy number 上升，但兩條 haplotype 都還在，所以「不是」LOH。CNV 與 LOH 是兩件事。';
    } else {
      note = '正常狀態：兩條 haplotype 各一份，heterozygous 位點可以正常當作 phasing 的錨點。';
    }
    TW.text(20, 300, note, 'anno zh' + (st.mode === 'neutral' ? ' somatic' : ''), svg);
  }

  function mountControls() {
    var ctl = root.querySelector('.widget__ctl');
    var seg = document.createElement('span');
    seg.className = 'wseg';
    seg.innerHTML = Object.keys(MODES).map(function (k) {
      return '<button type="button" data-mode="' + k + '" aria-pressed="' +
             (k === st.mode) + '">' + MODES[k].label + '</button>';
    }).join('');
    ctl.insertBefore(seg, ctl.firstChild);

    seg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]');
      if (!b) return;
      st.mode = b.getAttribute('data-mode');
      sync(); paint();
    });
  }

  function sync() {
    root.querySelectorAll('[data-mode]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === st.mode));
    });
  }

  return {
    init: function () { mountControls(); },
    render: function () { sync(); paint(); },
    reset: function () { st.mode = 'normal'; },
    check: function () {
      var seen = st.mode === 'neutral';
      return {
        ok: seen, score: seen ? 1 : 0,
        message: seen
          ? '✓ 正確：在此模型中，copy-neutral LOH 的 coverage 仍接近正常，需觀察 heterozygosity 才能辨識'
          : '請依序檢視四種狀態，特別比較 copy-neutral LOH 的 coverage 與 heterozygosity'
      };
    },
    getState: function () { return { mode: st.mode }; },
    setState: function (s) { if (s && s.mode && MODES[s.mode]) st.mode = s.mode; }
  };
});
