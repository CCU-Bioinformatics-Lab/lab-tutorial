/* ============================================================================
   marginal-vs-joint — 邊際頻率固定不動，聯合分布卻決定了樹的形狀
   ----------------------------------------------------------------------------
   這個元件只證明一件事：VAF 這種邊際統計，資訊上不足以決定演化樹。

   10 個細胞，兩個 somatic 位點 S1、S2。滑桿控制「同時帶有兩者」的細胞數 k：

       n11 = k          n10 = 5 - k          n01 = 3 - k          n00 = 2 + k

   所以邊際永遠是 S1 = (n10+n11)/10 = 5/10 = 0.50、
                  S2 = (n01+n11)/10 = 3/10 = 0.30 —— 跟 k 無關。
   而觀測到的狀態集合會隨 k 改變，於是相容的樹也跟著改變：

       k = 3  → 沒有 01     → 線性（00 → 10 → 11）
       k = 0  → 沒有 11     → 分支（00 → 10、00 → 01）
       0<k<3  → 四種狀態全都出現 → 沒有任何「每個突變只發生一次」的樹解釋得通

   最後那個情況值得講清楚：00、10、01、11 全都看到時，S2 必須出現在兩條不同的邊上
   （00→01 與 10→11），也就是發生了兩次。這在真實資料裡更常見的解釋是
   其中一個 call 是假的、或那幾條 read 被分到錯的 haplotype ——
   而這件事只有聯合觀測看得出來，邊際頻率永遠不會提示你。

   ★ seen 只在使用者操作時記錄，不在 paint() 裡記錄 ★
     paint() 必須是 model → DOM 的純函式（CLAUDE.md §9）。
     如果在 paint() 裡記錄，第一次 render 就會把預設狀態算成「看過了」，
     於是 check() 在使用者只拉了一下滑桿時就通過 —— 而且進度存檔還會把它救回來。

   刻意不用隨機數：兩個邊際是固定值，這樣才看得出「動的只有聯合分布」。
   ============================================================================ */
/* eslint-env browser */
'use strict';

TW.define('marginal-vs-joint', function (root) {

  var N = 10, N1 = 5, N2 = 3;         /* 細胞總數、帶 S1 的、帶 S2 的 */
  var KMAX = N2;                       /* 重疊最多就是 N2 */

  var st = { k: 3, joint: true, seen: [] };
  var stage = root.querySelector('.widget__stage');

  function counts() {
    var k = st.k;
    return { n11: k, n10: N1 - k, n01: N2 - k, n00: N - N1 - (N2 - k) };
  }

  /* 觀測到的狀態集合 → 拓撲類別。回傳 {key, zh, tie} */
  function topology() {
    var c = counts();
    if (c.n11 > 0 && c.n01 === 0) {
      return { key: 'linear', zh: '線性：S2 出現在已經有 S1 的細胞裡', tie: false };
    }
    if (c.n11 === 0 && c.n01 > 0) {
      return { key: 'branched', zh: '分支：有一群細胞只帶 S2，不帶 S1', tie: false };
    }
    /* 00、10、01、11 全部出現 → 違反「每個突變只發生一次」，不是單純的並列 */
    return { key: 'conflict', zh: '四種狀態全都出現 —— 沒有「每個突變只發生一次」的樹解釋得通',
             tie: true };
  }

  function remember(key) {
    if (st.seen.indexOf(key) === -1) st.seen.push(key);
  }

  /* ------------------------------------------------------------------ 繪製 -- */

  function paint() {
    var c = counts();
    var topo = topology();

    var svg = TW.stage(stage, 440, {
      title: '邊際頻率固定時，聯合分布仍可改變樹的形狀',
      desc: '10 個腫瘤細胞，兩個 somatic 位點。無論滑桿怎麼拉，' +
            'S1 的頻率固定是 0.50、S2 固定是 0.30。' +
            '改變的是同時帶有兩者的細胞數，也就是聯合分布。' +
            '目前的聯合計數是 00 有 ' + c.n00 + ' 個、10 有 ' + c.n10 +
            ' 個、01 有 ' + c.n01 + ' 個、11 有 ' + c.n11 + ' 個，' +
            (st.joint ? '相容的樹是' + topo.zh
                      : '但若 read 沒有同時跨過兩個位點，這張表就是未知的，樹也無法決定') + '。'
    });

    /* ── 邊際：永遠不動 ─────────────────────────────────────────────── */
    TW.text(20, 28, '邊際頻率（拉滑桿也不會變）', 'tick bold zh ok', svg);
    var m1 = TW.text(300, 28, 'S1 ＝ ' + (N1 / N).toFixed(2), 'tick bold mono ok', svg);
    m1.style.fontSize = '17px';
    var m2 = TW.text(430, 28, 'S2 ＝ ' + (N2 / N).toFixed(2), 'tick bold mono ok', svg);
    m2.style.fontSize = '17px';
    TW.text(20, 52, '10 個腫瘤細胞。小方塊：左＝S1、右＝S2，實心＝帶有。', 'tick zh', svg);

    /* ── 細胞列 ─────────────────────────────────────────────────────── */
    var groups = [];
    var g;
    for (g = 0; g < c.n11; g++) groups.push([1, 1]);
    for (g = 0; g < c.n10; g++) groups.push([1, 0]);
    for (g = 0; g < c.n01; g++) groups.push([0, 1]);
    for (g = 0; g < c.n00; g++) groups.push([0, 0]);

    groups.forEach(function (v, i) {
      var cx = 62 + i * 52;
      TW.svg('rect', {
        'class': 'bar' + (v[0] ? ' somatic' : ''),
        x: cx - 18, y: 66, width: 16, height: 17, rx: 2
      }, svg);
      TW.svg('rect', {
        'class': 'bar' + (v[1] ? ' somatic' : ''),
        x: cx + 2, y: 66, width: 16, height: 17, rx: 2
      }, svg);
      TW.svg('circle', { 'class': 'cell tumor', cx: cx, cy: 112, r: 16 }, svg);
      TW.svg('circle', { 'class': 'nucleus', cx: cx, cy: 112, r: 7 }, svg);
    });

    /* ── 聯合計數表 ─────────────────────────────────────────────────── */
    TW.text(20, 158, st.joint ? '聯合計數：每種狀態各有幾個細胞'
                              : '聯合計數：沒有跨兩個位點的 read，這張表是未知的',
      'tick bold zh' + (st.joint ? '' : ' bad'), svg);

    var cells = [['00', c.n00], ['10', c.n10], ['01', c.n01], ['11', c.n11]];
    cells.forEach(function (row, i) {
      var x = 40 + i * 128;
      var zero = st.joint && row[1] === 0;
      TW.svg('rect', {
        'class': 'box ' + (!st.joint ? 'ghost bad' : zero ? 'ghost bad' : 'sunken'),
        x: x, y: 172, width: 108, height: 62, rx: 6
      }, svg);
      TW.text(x + 54, 196, row[0], 'tick mid mono bold', svg);
      var val = TW.text(x + 54, 224, st.joint ? String(row[1]) : '?',
        'tick mid mono bold' + (st.joint ? (zero ? ' bad' : '') : ' bad'), svg);
      val.style.fontSize = '21px';
    });

    TW.text(20, 262, '合計 ' + N + ' 個細胞。S1 ＝ ' + N1 + ' 個、S2 ＝ ' + N2 + ' 個，兩者都不隨滑桿改變。',
      'tick zh', svg);

    /* ── 樹 ─────────────────────────────────────────────────────────── */
    TW.text(580, 158, st.joint ? '與這張表相容的樹' : '無法決定', 'tick bold zh', svg);

    var P = { '00': [620, 206], '10': [760, 206], '11': [900, 206], '01': [760, 290] };

    function edge(a, b, label, dashed) {
      var p = P[a], q = P[b];
      var dx = q[0] - p[0], dy = q[1] - p[1];
      var len = Math.sqrt(dx * dx + dy * dy);
      var ux = dx / len, uy = dy / len;
      TW.svg('line', {
        'class': 'conn somatic thick',
        x1: p[0] + ux * 27, y1: p[1] + uy * 27,
        x2: q[0] - ux * 31, y2: q[1] - uy * 31,
        style: dashed ? 'stroke-dasharray:8 5' : null,
        'marker-end': 'url(#arrow-sm)'
      }, svg);
      var mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      TW.text(mx + (uy ? 22 : 0), my - (uy ? 0 : 12), label, 'tick mid mono somatic', svg);
    }

    if (st.joint) {
      edge('00', '10', '+S1', false);
      if (c.n01 > 0) edge('00', '01', '+S2', false);
      if (c.n11 > 0) {
        if (topo.tie) { edge('10', '11', '+S2', true); edge('01', '11', '+S1', true); }
        else { edge('10', '11', '+S2', false); }
      }
    }

    ['00', '10', '01', '11'].forEach(function (s) {
      var seenState = (s === '00' ? c.n00 : s === '10' ? c.n10 : s === '01' ? c.n01 : c.n11) > 0;
      var cls = !st.joint ? 'box ghost' : seenState ? 'box plain' : 'box ghost';
      TW.svg('circle', { 'class': cls, cx: P[s][0], cy: P[s][1], r: 26 }, svg);
      TW.text(P[s][0], P[s][1] + 5, s,
        'tick mid mono' + (st.joint && seenState ? ' bold' : ''), svg);
    });

    /* ── 結論 ───────────────────────────────────────────────────────── */
    TW.svg('line', { 'class': 'axis', x1: 20, y1: 348, x2: 980, y2: 348 }, svg);

    if (!st.joint) {
      TW.text(20, 378,
        '只有邊際頻率可用時，四種狀態的細胞數全部未知 —— 上面每一種聯合分布都說得通，所以樹不唯一。',
        'anno zh bad', svg);
      TW.text(20, 408,
        '把「read 同時跨過兩個位點」打開，就回到長讀能提供的觀測。', 'anno zh', svg);
      return;
    }

    TW.text(20, 378, '目前的拓撲：' + topo.zh, 'anno zh bold', svg);
    TW.text(20, 408,
      topo.tie
        ? 'S2 落在兩條邊上（00→01 與 10→11）＝ 發生了兩次。真實資料裡更常是某個 call 假的，或 read 分錯 haplotype。'
        : '上方兩個邊際頻率從頭到尾沒有動過。動的只有聯合分布，而樹的形狀跟著它變。',
      'anno zh', svg);
  }

  /* ---------------------------------------------------------------- 控制項 -- */

  function mountControls() {
    var ctl = root.querySelector('.widget__ctl');
    var box = document.createElement('span');
    box.style.cssText = 'display:flex;flex-wrap:wrap;gap:.4rem 1rem;flex:1;align-items:center';
    box.innerHTML =
      '<label class="wctl">同時帶有 S1 與 S2 的細胞數 ' +
      '<input type="range" min="0" max="' + KMAX + '" step="1" value="3" data-k="k">' +
      '<output>3</output></label>' +
      '<span class="wseg"><button type="button" data-j="1" aria-pressed="true">' +
      'read 跨過兩個位點</button>' +
      '<button type="button" data-j="0" aria-pressed="false">只有邊際頻率</button></span>';
    ctl.insertBefore(box, ctl.firstChild);

    box.addEventListener('input', function (e) {
      if (!e.target.getAttribute || e.target.getAttribute('data-k') !== 'k') return;
      st.k = parseInt(e.target.value, 10);
      if (st.joint) remember(topology().key);
      sync(); paint();
    });
    box.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-j]') : null;
      if (!b) return;
      st.joint = b.getAttribute('data-j') === '1';
      if (st.joint) remember(topology().key);
      sync(); paint();
    });
  }

  function sync() {
    var i = root.querySelector('[data-k="k"]');
    if (i) {
      i.value = st.k;
      var o = i.parentNode.querySelector('output');
      if (o) o.textContent = String(st.k);
    }
    root.querySelectorAll('[data-j]').forEach(function (b) {
      b.setAttribute('aria-pressed',
        String((b.getAttribute('data-j') === '1') === st.joint));
    });
  }

  return {
    init: function () { mountControls(); },
    render: function () { sync(); paint(); },
    /* 只清使用者的操作紀錄，不換題目 —— 兩個邊際本來就是固定的 */
    reset: function () { st.k = 3; st.joint = true; st.seen = []; },

    check: function () {
      /* 兩端都要真的看過才算 —— 只看到中間的衝突狀態不足以說明「同一組邊際、不同的樹」 */
      var hasLinear = st.seen.indexOf('linear') !== -1;
      var hasBranched = st.seen.indexOf('branched') !== -1;
      var ok = hasLinear && hasBranched;
      return {
        ok: ok, score: ok ? 1 : 0,
        message: ok
          ? '✓ 線性與分支都看到了，而 S1 ＝ 0.50、S2 ＝ 0.30 從頭到尾沒有變過 —— '
            + '同一組邊際頻率相容於不只一棵樹'
          : '把滑桿在 0 與 ' + KMAX + ' 之間走一趟：'
            + (hasLinear ? '線性已看到，還缺 k=0 的分支' :
               hasBranched ? '分支已看到，還缺 k=' + KMAX + ' 的線性'
                           : '兩端各停一次') + '。邊際頻率不會動，但樹的形狀會換'
      };
    },

    getState: function () { return { k: st.k, joint: st.joint, seen: st.seen.slice() }; },
    setState: function (s) {
      if (!s) return;
      if (typeof s.k === 'number' && isFinite(s.k)) {
        st.k = Math.max(0, Math.min(KMAX, Math.round(s.k)));
      }
      if (typeof s.joint === 'boolean') st.joint = s.joint;
      if (Array.isArray(s.seen)) {
        st.seen = s.seen.filter(function (x) { return typeof x === 'string'; });
      }
    }
  };
});
