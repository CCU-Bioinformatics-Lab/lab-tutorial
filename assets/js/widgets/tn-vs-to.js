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

  function paint() {
    var isTN = st.mode === 'tn';
    var svg = TW.stage(stage, 380, {
      title: (isTN ? '配對腫瘤－正常' : '僅腫瘤') + '模式下的候選點命運',
      desc: '每個方塊是一個候選變異。左欄是 caller 產生的候選，右欄是過濾後留下來的。' +
            (isTN ? '有配對正常樣本時，germline 與多數 artifact 都能被排除。'
                  : '僅有 PON 時，未被資料庫涵蓋的私有 germline 與 artifact 可能仍保留為候選，需要額外證據判讀。')
    });

    /* 標題 */
    TW.text(20, 26, '候選變異（caller 輸出）', 'lbl bold zh', svg);
    TW.text(560, 26, isTN ? '用配對 normal 過濾後' : '用 PON 過濾後', 'lbl bold zh', svg);

    TW.svg('rect', {
      'class': 'box ' + (isTN ? 'accent' : 'warn'),
      x: 320, y: 44, width: 200, height: 300, rx: 8
    }, svg);
    TW.text(420, 76, isTN ? 'matched normal' : 'Panel of Normals', 'anno mid bold zh', svg);
    TW.text(420, 100, isTN ? '這個病人自己的' : '族群資料庫', 'tick mid zh', svg);
    TW.text(420, 122, isTN ? '正常組織' : '1000G · gnomAD …', 'tick mid', svg);

    var y = 60, kept = 0, dropped = 0, stuck = 0;

    KINDS.forEach(function (kind) {
      var fate = isTN ? kind.tn : kind.to;
      for (var i = 0; i < kind.n; i++) {
        /* 左：候選 */
        TW.svg('rect', {
          'class': 'mark ' + kind.cls, x: 40 + i * 30, y: y, width: 22, height: 22, rx: 4
        }, svg);

        /* 右：過濾後 */
        if (fate !== 'drop') {
          TW.svg('rect', {
            'class': 'mark ' + (fate === 'stuck' ? 'artifact' : kind.cls),
            x: 580 + i * 30, y: y, width: 22, height: 22, rx: 4
          }, svg);
          if (fate === 'stuck') {
            TW.text(580 + i * 30 + 11, y + 17, '!', 'tick mid bold bad', svg);
          }
        }

        /* 連線 */
        TW.svg('line', {
          'class': fate === 'drop' ? 'guide' : 'conn',
          x1: 62 + (kind.n - 1) * 30, y1: y + 11,
          x2: fate === 'drop' ? 320 : 578, y2: y + 11,
          stroke: fate === 'drop' ? 'var(--rule)' : (fate === 'stuck' ? 'var(--bad)' : 'var(--somatic)'),
          'marker-end': fate === 'drop' ? '' : 'url(#arrow-sm)'
        }, svg);
        break;   /* 每類只畫一條連線 */
      }

      if (fate === 'keep') kept += kind.n;
      else if (fate === 'stuck') { kept += kind.n; stuck += kind.n; }
      else dropped += kind.n;

      TW.text(40 + kind.n * 30 + 8, y + 17, kind.zh, 'tick zh ' +
        (kind.cls === 'somatic' ? 'somatic' : kind.cls === 'artifact' ? 'artifact' : 'germline'), svg);

      if (fate === 'drop') {
        TW.text(330, y + 17, '✗ 排除', 'tick bad', svg);
      }

      y += 34 * Math.max(1, Math.ceil(kind.n / 6)) + 30;
    });

    /* 結果面板 */
    var tp = KINDS[0].n;
    var fp = stuck;
    var prec = tp / (tp + fp);

    TW.svg('rect', { 'class': 'box ' + (isTN ? 'ok' : 'bad'), x: 580, y: 300, width: 400, height: 64, rx: 8 }, svg);
    var pt = TW.text(600, 340, 'precision ≈ ' + prec.toFixed(2), 'lbl bold mono', svg);
    pt.setAttribute('font-size', '26');
    TW.text(770, 326, tp + ' 個真 somatic', 'tick somatic', svg);
      TW.text(770, 350, fp + ' 個仍保留的候選假陽性', 'tick zh ' + (fp ? 'bad' : 'ok'), svg);

    TW.text(20, 372, isTN
      ? '有配對 normal 時，這個病人「私有的」germline 變異也可被觀察，因此可排除。'
      : '★ PON 是族群資料庫，未涵蓋某個人私有的 germline，也未涵蓋未曾觀察的 artifact；這些仍保留為候選假陽性。',
      'anno zh' + (isTN ? '' : ' bad'), svg);
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
