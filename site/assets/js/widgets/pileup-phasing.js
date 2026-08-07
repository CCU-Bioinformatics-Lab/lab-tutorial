/* ============================================================================
   pileup-phasing — 手動把 reads 分到 HP1 / HP2
   ----------------------------------------------------------------------------
   這是整份教材最重要的一個練習：phasing 的核心直覺不是統計，
   而是「同一條分子上一起出現的 alleles，就屬於同一條 haplotype」。

   刻意加進來的兩個教學元素：
     · 有一條 read 完全不覆蓋任何 heterozygous 位點 → 無法指派（untagged / HP3）
     · 有一條 read 帶一個定序錯誤 → 多數決仍能正確指派

   契約：init / render / reset / check / getState / setState
   ============================================================================ */
/* eslint-env browser */
'use strict';

TW.define('pileup-phasing', function (root, cfg) {

  var BASES = ['A', 'C', 'G', 'T'];
  var model = null;
  var stage = root.querySelector('.widget__stage');

  var nSites = cfg.sites || 3;
  var nReads = cfg.reads || 12;

  /* ---- 產生資料 -------------------------------------------------------- */

  function build() {
    var rnd = TW.rng(cfg.seed);

    /* 每個 het 位點：HP1 與 HP2 各一個不同的 allele */
    var sites = [];
    var span = 820 / (nSites + 1);
    for (var i = 0; i < nSites; i++) {
      var a = Math.floor(rnd() * 4);
      var b = (a + 1 + Math.floor(rnd() * 3)) % 4;   /* 保證不同 */
      sites.push({ x: Math.round(120 + span * (i + 1)), hp1: BASES[a], hp2: BASES[b] });
    }

    var reads = [];
    for (var r = 0; r < nReads; r++) {
      var hp = rnd() < 0.5 ? 1 : 2;
      var x0, x1;

      if (r === nReads - 1) {
        /* 最後一條刻意放在所有位點的右邊 → 無法指派，用來教 untagged */
        x0 = sites[nSites - 1].x + 26;
        x1 = 980;
        hp = 0;
      } else {
        x0 = 60 + Math.floor(rnd() * (span * 1.4));
        x1 = x0 + Math.round(span * (1.6 + rnd() * 1.8));
        if (x1 > 980) x1 = 980;
      }

      var obs = sites.map(function (s) {
        if (s.x < x0 + 10 || s.x > x1 - 10) return null;   /* 沒覆蓋到 */
        return hp === 1 ? s.hp1 : hp === 2 ? s.hp2 : null;
      });

      reads.push({ x0: x0, x1: x1, truth: hp, obs: obs, err: -1 });
    }

    /* 挑一條有覆蓋到 ≥3 個位點的 read，種一個定序錯誤進去 */
    for (var k = 0; k < reads.length; k++) {
      var cov = reads[k].obs.filter(function (o) { return o !== null; }).length;
      if (cov >= 3 && reads[k].truth !== 0) {
        var idx = reads[k].obs.findIndex(function (o) { return o !== null; });
        var wrong = BASES.filter(function (b) {
          return b !== sites[idx].hp1 && b !== sites[idx].hp2;
        })[0];
        reads[k].obs[idx] = wrong;
        reads[k].err = idx;
        break;
      }
    }

    return { sites: sites, reads: reads, assign: reads.map(function () { return 0; }), checked: false };
  }

  /* ---- 繪圖 ------------------------------------------------------------ */

  function paint() {
    var H = 78 + model.reads.length * 24 + 30;
    var svg = TW.stage(stage, H, {
      title: '待 phasing 的 read pileup',
      desc: '共 ' + model.reads.length + ' 條 read 與 ' + model.sites.length +
            ' 個 heterozygous 位點。每條 read 在它覆蓋到的位點上顯示一個鹼基字母。' +
            '請把攜帶相同 allele 組合的 read 歸為同一群。'
    });

    /* 位點標題 */
    model.sites.forEach(function (s, i) {
      TW.svg('line', { 'class': 'guide', x1: s.x, y1: 46, x2: s.x, y2: 66 + model.reads.length * 24 }, svg);
      TW.text(s.x, 22, 'SNP ' + (i + 1), 'tick mid', svg);
      if (model.checked) {
        TW.text(s.x, 40, s.hp1, 'tick mid bold hp1 mono', svg);
        TW.text(s.x + 16, 40, s.hp2, 'tick mid bold hp2 mono', svg);
      } else {
        TW.text(s.x, 40, '?', 'tick mid', svg);
      }
    });

    TW.text(20, 22, 'HP1', 'tick bold hp1', svg);
    TW.text(20, 40, 'HP2', 'tick bold hp2', svg);

    /* reads */
    model.reads.forEach(function (r, i) {
      var y = 62 + i * 24;
      var a = model.assign[i];
      var cls = 'read pick ' + (a === 1 ? 'hp1' : a === 2 ? 'hp2' : 'hp0');
      if (model.checked) {
        var right = (a === r.truth) || (r.truth === 0 && a === 0);
        cls += right ? '' : ' sel';
      }

      var rect = TW.svg('rect', {
        'class': cls, x: r.x0, y: y, width: r.x1 - r.x0, height: 16, rx: 8,
        'data-read': i, tabindex: 0, role: 'button',
        'aria-label': '第 ' + (i + 1) + ' 條 read，目前指派為 ' +
                      (a === 0 ? '未指派' : 'HP' + a)
      }, svg);
      rect.style.cursor = 'pointer';

      /* 鹼基字母 */
      r.obs.forEach(function (b, k) {
        if (b === null) return;
        var s = model.sites[k];
        var t = TW.text(s.x, y + 13, b, 'base ' + b.toLowerCase() + ' mono', svg);
        t.setAttribute('font-size', '15');
        t.style.pointerEvents = 'none';
        if (model.checked && r.err === k) {
          /* 空心圈：只是把這個鹼基圈起來，不要用 artifact 的填色蓋住字母 */
          TW.svg('circle', { 'class': 'mark artifact', cx: s.x, cy: y + 8, r: 10,
                             style: 'fill:none' }, svg);
        }
      });

      /* 指派標籤 */
      TW.text(r.x1 + 8, y + 13, a === 0 ? '—' : 'HP' + a,
              'tick ' + (a === 1 ? 'hp1' : a === 2 ? 'hp2' : ''), svg);

      if (model.checked) {
        var ok = (a === r.truth) || (r.truth === 0 && a === 0);
        TW.text(r.x0 - 10, y + 13, ok ? '✓' : '✗',
                'tick end bold ' + (ok ? 'ok' : 'bad'), svg);
      }
    });

    /* 說明 */
    var yb = 62 + model.reads.length * 24 + 20;
    TW.text(20, yb, model.checked
      ? '被圈起來的字母是定序錯誤 —— 多數決仍然指向正確的 haplotype。最後一條 read 沒有覆蓋任何位點，無法指派才是正確判讀。'
      : '選取 read 可切換：未指派 → HP1 → HP2 → 未指派。有些 read 無法判定，可能是資料觀測範圍不足。',
      'tick zh', svg);

    /* 事件 */
    svg.addEventListener('click', function (e) {
      var el = e.target.closest('[data-read]');
      if (!el) return;
      cycle(+el.getAttribute('data-read'));
    });
    svg.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var el = e.target.closest ? e.target.closest('[data-read]') : null;
      if (!el) return;
      e.preventDefault();
      cycle(+el.getAttribute('data-read'));
    });
  }

  function cycle(i) {
    model.assign[i] = (model.assign[i] + 1) % 3;
    model.checked = false;
    paint();
    TW.msg(root, '');
  }

  /* ---- 控制列 ---------------------------------------------------------- */

  function mountControls() {
    var ctl = root.querySelector('.widget__ctl');
    var lg = document.createElement('span');
    lg.className = 'wctl';
    lg.innerHTML = '<span style="font-size:.8rem">選取 read 以切換指派</span>';
    ctl.insertBefore(lg, ctl.firstChild);
  }

  /* ---- 契約 ------------------------------------------------------------ */

  return {
    init: function () { model = build(); mountControls(); },

    render: function () { paint(); },

    reset: function () {
      model.assign = model.reads.map(function () { return 0; });
      model.checked = false;
    },

    check: function () {
      var total = 0, right = 0, unassigned = 0;

      model.reads.forEach(function (r, i) {
        var a = model.assign[i];
        if (r.truth === 0) {
          /* 無法指派的 read：留白才算對 */
          total++;
          if (a === 0) right++;
          return;
        }
        total++;
        if (a === 0) { unassigned++; return; }
        if (a === r.truth) right++;
      });

      /* HP1/HP2 的編號本身是任意的 —— 整組對調也該算對。
         這正是 guardrail #1 想講的事，所以這裡必須寬容處理。 */
      var flipped = 0;
      model.reads.forEach(function (r, i) {
        var a = model.assign[i];
        if (r.truth === 0) { if (a === 0) flipped++; return; }
        if (a !== 0 && a !== r.truth) flipped++;
        else if (a === 0) { /* 未指派，兩邊都不算 */ }
      });

      var score = Math.max(right, flipped) / total;
      model.checked = true;
      paint();

      var assigned = model.assign.filter(function (a) { return a !== 0; }).length;
      var msg;
      if (assigned === 0) {
        msg = '尚未指派任何 read —— 選取 read 即可在 HP1 / HP2 之間切換';
      } else if (score >= 0.999) {
        msg = flipped > right
          ? '✓ 全部正確 —— 你的 HP1/HP2 與答案方向相反，但標籤方向可任意指定'
          : '✓ 全部正確';
      } else if (unassigned > 0 && score > 0.7) {
        msg = '目前正確率為 ' + Math.round(score * 100) + '%；尚有 ' + unassigned +
              ' 條有資訊的 read 沒指派。';
      } else {
        msg = Math.round(score * 100) + '% 正確。看被圈起來的那個字母 —— 那是定序錯誤。';
      }

      return { ok: score >= 0.999, score: score, message: msg };
    },

    getState: function () { return { assign: model.assign.slice(), checked: model.checked }; },

    setState: function (s) {
      if (!s || !s.assign || s.assign.length !== model.reads.length) return;
      model.assign = s.assign.slice();
      model.checked = !!s.checked;
    }
  };
});
