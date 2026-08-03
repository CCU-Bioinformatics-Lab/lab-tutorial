/* ============================================================================
   methyl-heatmap — read × CpG 的甲基化熱圖
   ----------------------------------------------------------------------------
   兩個教學目標：
     1. 甲基化是「每條 read 上的另一層訊號」，跟 allele 是不同維度
     2. 同一個 allele、同一條 haplotype 之內，仍可能有多群不同的甲基化模式
        —— 這就是 Deck E 說的 within-state epigenetic heterogeneity

   toggles 讓學生自己把 read 依 allele / haplotype / 甲基群 重新排序，
   親眼看到哪一種排序才會讓區塊浮現。
   ============================================================================ */
/* eslint-env browser */
'use strict';

TW.define('methyl-heatmap', function (root, cfg) {

  var st = { sortBy: 'none', showLow: true };
  var stage = root.querySelector('.widget__stage');
  var data = null;

  var N_READS = 24, N_CPG = 18;

  function build() {
    var rnd = TW.rng(cfg.seed || 11);
    var reads = [];
    for (var i = 0; i < N_READS; i++) {
      var hp = rnd() < 0.5 ? 1 : 2;
      var alt = hp === 1 ? (rnd() < 0.55 ? 1 : 0) : 0;   /* somatic 只在 HP1 上 */
      /* 甲基群：ALT read 內部再分兩群 —— 這是本元件的重點 */
      var grp = alt ? (rnd() < 0.5 ? 'A1' : 'A2') : (hp === 1 ? 'R1' : 'R2');
      var base = { A1: 0.85, A2: 0.15, R1: 0.5, R2: 0.45 }[grp];

      var cpg = [];
      for (var c = 0; c < N_CPG; c++) {
        if (rnd() < 0.06) { cpg.push(null); continue; }      /* 沒讀到 */
        cpg.push(rnd() < base ? 1 : 0);
      }
      reads.push({ hp: hp, alt: alt, grp: grp, cpg: cpg, id: i });
    }
    return reads;
  }

  function ordered() {
    var r = data.slice();
    if (st.sortBy === 'allele') r.sort(function (a, b) { return b.alt - a.alt || a.hp - b.hp; });
    else if (st.sortBy === 'hp') r.sort(function (a, b) { return a.hp - b.hp || b.alt - a.alt; });
    else if (st.sortBy === 'meth') r.sort(function (a, b) { return a.grp < b.grp ? -1 : a.grp > b.grp ? 1 : 0; });
    return r;
  }

  function paint() {
    var rows = ordered();
    var CW = 34, RH = 17;
    var L = 150, T = 60;
    var H = T + N_READS * RH + 80;

    var svg = TW.stage(stage, H, {
      title: 'read × CpG 甲基化熱圖',
      desc: '每一列是一條 read，每一欄是一個 CpG 位點。實心圓代表 methylated，' +
            '空心圓代表 unmethylated，虛線圓代表該位置沒有讀到。' +
            '左側標出每條 read 的 haplotype 與該位點的 allele。'
    });

    /* 欄標題 */
    TW.text(L + (N_CPG * CW) / 2, 26, 'CpG 位點（同一個區域內）', 'anno mid zh', svg);
    TW.text(20, 26, 'HP / allele', 'tick bold', svg);

    rows.forEach(function (r, i) {
      var y = T + i * RH;

      /* 左側標籤 */
      TW.svg('rect', { 'class': 'read ' + (r.hp === 1 ? 'hp1' : 'hp2'),
                       x: 20, y: y + 2, width: 34, height: 12, rx: 6 }, svg);
      TW.text(62, y + 12, 'HP' + r.hp, 'tick ' + (r.hp === 1 ? 'hp1' : 'hp2'), svg);
      TW.text(104, y + 12, r.alt ? 'ALT' : 'REF',
              'tick bold ' + (r.alt ? 'somatic' : ''), svg);

      /* 甲基化格 */
      r.cpg.forEach(function (v, c) {
        var cx = L + c * CW + CW / 2;
        var cls = v === null ? 'cpg na' : v ? 'cpg met' : 'cpg unmet';
        TW.svg('circle', { 'class': cls, cx: cx, cy: y + 8, r: 5.5 }, svg);
      });

      /* 甲基群標記（只在依甲基群排序時顯示） */
      if (st.sortBy === 'meth') {
        TW.text(L + N_CPG * CW + 12, y + 12, r.grp, 'tick mono', svg);
      }
    });

    /* 群組分隔線 */
    if (st.sortBy !== 'none') {
      for (var i = 1; i < rows.length; i++) {
        var key = st.sortBy === 'allele' ? 'alt' : st.sortBy === 'hp' ? 'hp' : 'grp';
        if (rows[i][key] !== rows[i - 1][key]) {
          TW.svg('line', {
            'class': 'axis', x1: 20, y1: T + i * RH - 1,
            x2: L + N_CPG * CW + 40, y2: T + i * RH - 1, 'stroke-width': 2
          }, svg);
        }
      }
    }

    /* 結論 */
    var yb = T + N_READS * RH + 30;
    var note;
    if (st.sortBy === 'meth') {
      note = '依甲基群排序後可見：ALT 的 read 內部仍分成 A1 與 A2 兩群。' +
             '它們的 allele 與 haplotype 相同，但甲基化模式不同。';
    } else if (st.sortBy === 'allele') {
      note = 'ALT 與 REF 的整體甲基化程度在此合成資料中有所差異，但 ALT 區塊內部仍不均勻。請選擇「依甲基群」排序。';
    } else if (st.sortBy === 'hp') {
      note = '依 haplotype 排序看不出清楚的區塊，因為這個區域的甲基化差異主要不是沿著 HP1／HP2 分的。';
    } else {
      note = '目前為原始順序，甲基化模式尚未形成清楚區塊。請使用下方按鈕切換排序，觀察哪種排序能顯示群組結構。';
    }
    TW.text(20, yb, note, 'anno zh' + (st.sortBy === 'meth' ? ' somatic' : ''), svg);

    TW.text(20, yb + 26,
      '實心 = methylated　空心 = unmethylated　虛線 = 該位置沒讀到甲基化訊號',
      'tick zh', svg);
  }

  function mountControls() {
    var ctl = root.querySelector('.widget__ctl');
    var seg = document.createElement('span');
    seg.className = 'wseg';
    seg.innerHTML =
      '<button type="button" data-s="none"   aria-pressed="true">原始順序</button>' +
      '<button type="button" data-s="hp"     aria-pressed="false">依 haplotype</button>' +
      '<button type="button" data-s="allele" aria-pressed="false">依 allele</button>' +
      '<button type="button" data-s="meth"   aria-pressed="false">依甲基群</button>';
    ctl.insertBefore(seg, ctl.firstChild);
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-s]');
      if (!b) return;
      st.sortBy = b.getAttribute('data-s');
      sync(); paint();
    });
  }

  function sync() {
    root.querySelectorAll('[data-s]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-s') === st.sortBy));
    });
  }

  return {
    init: function () { data = build(); mountControls(); },
    render: function () { sync(); paint(); },
    reset: function () { st.sortBy = 'none'; },
    check: function () {
      var ok = st.sortBy === 'meth';
      return {
        ok: ok, score: ok ? 1 : 0,
        message: ok
          ? '✓ 正確：同一個 ALT 狀態、同一條 haplotype 之內，甲基化仍分成兩群'
          : '請依序嘗試各種排序，找出能顯示群組結構的排序方式'
      };
    },
    getState: function () { return { sortBy: st.sortBy }; },
    setState: function (s) { if (s && s.sortBy) st.sortBy = s.sortBy; }
  };
});
