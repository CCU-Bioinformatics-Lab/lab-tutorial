/* ============================================================================
   gt-decoder — 解碼 LongPhase-TO 的 GT:GT2:GT3
   ----------------------------------------------------------------------------
   這個編碼比任何一份投影片呈現的都深：在 LOH 區域裡還會再巢狀成
   hp1-1-1 / hp1-2-2。語意直接對照 longphase-to/docs/phase.md 與
   ParsingBam.h:105-112 的 FORMAT 定義。

   注意這跟 LongPhase-S 完全不同 —— 那邊的 somatic haplotype 是寫在
   BAM 的 HP:Z:1-1 裡，不是 VCF 的 FORMAT 欄位。
   ============================================================================ */
/* eslint-env browser */
'use strict';

TW.define('gt-decoder', function (root, cfg) {

  var PRESETS = [
    { v: '0|1:./.:./.', zh: 'germline heterozygous' },
    { v: '0|0:.|1:./.', zh: 'somatic（非 LOH），來自 HP2' },
    { v: '0|0:1|.:./.', zh: 'somatic（非 LOH），來自 HP1' },
    { v: '0|0:1|1:./.', zh: 'somatic，來源無法判定（hp3）' },
    { v: '.|1:./.:./.', zh: 'LOH：HP1 已失去' },
    { v: '0|.:1|.:0|.', zh: 'LOH 區內的 somatic 分支' },
    { v: '.|0:.|1:.|1', zh: 'LOH 區內，來源不明' }
  ];

  var st = { text: cfg.value || '0|0:.|1:./.' };
  var stage = root.querySelector('.widget__stage');
  var input = null;

  /* ---- 解析 ------------------------------------------------------------ */

  function parse(s) {
    s = String(s).trim();
    var parts = s.split(':');
    if (parts.length !== 3) {
      return { error: '需要三個欄位，用冒號分隔：<code>GT:GT2:GT3</code>。你輸入了 ' +
                      parts.length + ' 個。' };
    }
    var fields = [];
    for (var i = 0; i < 3; i++) {
      var m = /^([01.])([|/])([01.])$/.exec(parts[i]);
      if (!m) {
        return { error: '第 ' + (i + 1) + ' 個欄位 <code>' + parts[i] +
                        '</code> 格式不對。每個欄位是「allele 分隔符 allele」，' +
                        'allele 只能是 <code>0</code>、<code>1</code> 或 <code>.</code>，' +
                        '分隔符是 <code>|</code>（已定相）或 <code>/</code>（未定相）。' };
      }
      fields.push({ a: m[1], sep: m[2], b: m[3], raw: parts[i] });
    }
    return { fields: fields };
  }

  /* 語意判讀，對照 docs/phase.md 的定義表 */
  function interpret(f) {
    var gt = f[0], gt2 = f[1], gt3 = f[2];
    var g = gt.a + gt.b;
    var g2 = gt2.a + gt2.b;
    var g3 = gt3.a + gt3.b;

    var isLOH = gt.a === '.' || gt.b === '.';
    var hasSomatic = g2 !== '..';
    var inGT3 = g3 !== '..';

    var out = { loh: isLOH, somatic: hasSomatic, lines: [] };

    /* GT 層 */
    if (g === '01' || g === '10') out.lines.push(['GT', 'germline heterozygous —— 兩條 haplotype 一個 ref、一個 alt', 'germline']);
    else if (g === '00') out.lines.push(['GT', '兩條 haplotype 都是 reference —— 若 GT2 有內容，代表這是非 LOH 區的 somatic', '']);
    else if (g === '11') out.lines.push(['GT', 'germline homozygous alternate', 'germline']);
    else if (isLOH) out.lines.push(['GT', '有一邊是「.」→ 這個位置落在 LOH 區，其中一條 haplotype 已失去', 'artifact']);

    /* GT2 層 */
    if (!hasSomatic) {
      out.lines.push(['GT2', '<code>./.</code> —— 這個位置沒有 somatic 事件', '']);
    } else if (g2 === '11') {
      out.lines.push(['GT2', '<code>1|1</code> —— somatic haplotype <b>無法判定</b>（hp3）', 'artifact']);
    } else if (gt2.a === '1') {
      out.lines.push(['GT2', 'somatic 變異來自 <b>HP1</b>，也就是 <code>hp1-1</code>', 'hp1']);
    } else if (gt2.b === '1') {
      out.lines.push(['GT2', 'somatic 變異來自 <b>HP2</b>，也就是 <code>hp2-1</code>', 'hp2']);
    } else {
      out.lines.push(['GT2', '該側為 reference', '']);
    }

    /* GT3 層 */
    if (!inGT3) {
      out.lines.push(['GT3', '<code>./.</code> —— 不需要第三層', '']);
    } else if (isLOH) {
      var side = gt2.a !== '.' || gt3.a !== '.' ? '1' : '2';
      out.lines.push(['GT3',
        'LOH 區內的再分支：保留下來的那條 haplotype 之下，somatic 狀態再分成兩支' +
        '（<code>hp1-' + side + '-1</code> / <code>hp1-' + side + '-2</code>）', 'somatic']);
    } else {
      out.lines.push(['GT3', '非 LOH 區通常不會用到 GT3', 'artifact']);
    }

    return out;
  }

  /* ---- 繪圖 ------------------------------------------------------------ */

  function paint() {
    var p = parse(st.text);
    var H = 340;
    var svg = TW.stage(stage, H, {
      title: 'GT:GT2:GT3 三層編碼的結構',
      desc: p.error ? '目前輸入無法解析。'
        : '三個欄位由左到右分別描述 germline haplotype、somatic haplotype，以及 LOH 區內的再分支。'
    });

    if (p.error) {
      TW.text(20, 60, '無法解析', 'lbl bad bold', svg);
      return;
    }

    var info = interpret(p.fields);

    /* 三個欄位的視覺 */
    var names = ['GT', 'GT2', 'GT3'];
    var subs = ['germline haplotype', 'somatic haplotype', 'LOH 內再分支'];
    p.fields.forEach(function (f, i) {
      var x = 30 + i * 240;
      TW.svg('rect', { 'class': 'box' + (f.raw === './.' ? ' ghost' : ' accent'),
                       x: x, y: 40, width: 210, height: 96, rx: 8 }, svg);
      TW.text(x + 105, 66, names[i], 'lbl mid bold', svg);
      var t = TW.text(x + 105, 106, f.raw, 'lbl mid bold mono', svg);
      t.style.fontSize = '28px';
      TW.text(x + 105, 156, subs[i], 'tick mid zh', svg);

      /* allele 標記 */
      TW.text(x + 60, 128, f.a === '.' ? '未知' : f.a === '1' ? 'ALT' : 'REF', 'tick mid', svg);
      TW.text(x + 150, 128, f.b === '.' ? '未知' : f.b === '1' ? 'ALT' : 'REF', 'tick mid', svg);
    });

    /* 樹狀圖 */
    var TX = 760;
    TW.text(TX, 30, '對應的 haplotype 結構', 'anno bold zh', svg);
    var gt = p.fields[0], gt2 = p.fields[1];
    var lohLost = gt.a === '.' ? 1 : gt.b === '.' ? 2 : 0;

    /* HP1 / HP2 */
    [1, 2].forEach(function (hp) {
      var y = 60 + (hp - 1) * 110;
      var lost = lohLost === hp;
      TW.svg('rect', {
        'class': 'read ' + (lost ? 'hp0' : (hp === 1 ? 'hp1' : 'hp2')),
        x: TX, y: y, width: 130, height: 14, rx: 7,
        opacity: lost ? 0.35 : 1
      }, svg);
      TW.text(TX + 140, y + 12, lost ? 'HP' + hp + '（已失去）' : 'HP' + hp,
              'tick zh ' + (lost ? '' : (hp === 1 ? 'hp1' : 'hp2')), svg);

      /* somatic 分支 */
      var hasSom = (hp === 1 && gt2.a === '1') || (hp === 2 && gt2.b === '1') ||
                   (gt2.a === '1' && gt2.b === '1');
      if (hasSom && !lost) {
        TW.svg('path', {
          'class': 'conn somatic', d: 'M' + (TX + 20) + ',' + (y + 16) + ' L' + (TX + 20) + ',' + (y + 40),
          'marker-end': 'url(#arrow-sm)'
        }, svg);
        TW.svg('rect', { 'class': 'read ' + (hp === 1 ? 'hp1' : 'hp2'),
                         x: TX + 30, y: y + 34, width: 100, height: 14, rx: 7 }, svg);
        TW.svg('circle', { 'class': 'mark somatic', cx: TX + 60, cy: y + 41, r: 6 }, svg);
        TW.text(TX + 140, y + 46, 'HP' + hp + '-1', 'tick somatic bold', svg);
      }
    });

    /* 解讀文字 */
    var y = 190;
    info.lines.forEach(function (l) {
      TW.text(30, y, l[0], 'tick bold mono', svg);
      var el = TW.svg('foreignObject', { x: 90, y: y - 16, width: 620, height: 30 }, svg);
      var div = document.createElement('div');
      div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
      div.style.cssText = 'font:16px var(--font-latin),var(--font-zh);color:var(--ink);line-height:1.5';
      div.innerHTML = l[1];
      el.appendChild(div);
      y += 34;
    });

    if (info.loh) {
      TW.text(30, 320, '★ 這是 LOH 區的位點：其中一條 germline haplotype 已經失去，所以 GT 有一側是「.」',
              'anno zh artifact', svg);
    }
  }

  function mountControls() {
    var ctl = root.querySelector('.widget__ctl');

    var lab = document.createElement('label');
    lab.className = 'wctl';
    lab.innerHTML = 'GT:GT2:GT3 <input type="text" class="mono" size="14" value="' + st.text + '">';
    ctl.insertBefore(lab, ctl.firstChild);
    input = lab.querySelector('input');
    input.addEventListener('input', function () { st.text = input.value; run(); });

    var sel = document.createElement('select');
    sel.className = 'wctl';
    sel.innerHTML = '<option value="">— 常見組合 —</option>' +
      PRESETS.map(function (p) {
        return '<option value="' + p.v + '">' + p.v + '　' + p.zh + '</option>';
      }).join('');
    sel.addEventListener('change', function () {
      if (!sel.value) return;
      st.text = input.value = sel.value;
      run();
    });
    ctl.insertBefore(sel, ctl.querySelector('[data-act="check"]'));
  }

  function run() {
    paint();
    var p = parse(st.text);
    var note = root.querySelector('.gt-err');
    if (!note) {
      note = document.createElement('p');
      note.className = 'gt-err note';
      note.style.cssText = 'margin:0;padding:0 1rem 1rem';
      stage.parentNode.insertBefore(note, stage.nextSibling);
    }
    note.innerHTML = p.error || '';
    note.style.display = p.error ? '' : 'none';
    note.style.color = p.error ? 'var(--bad)' : '';
  }

  return {
    init: function () { mountControls(); run(); },
    render: function () { if (input) input.value = st.text; run(); },
    reset: function () { st.text = '0|0:.|1:./.'; if (input) input.value = st.text; run(); },
    check: function () {
      var p = parse(st.text);
      if (p.error) return { ok: false, message: '請先修正格式，使其可解析' };
      var info = interpret(p.fields);
      return {
        ok: true, score: 1,
        message: (info.loh ? 'LOH 區 · ' : '非 LOH 區 · ') +
                 (info.somatic ? '有 somatic 事件' : '無 somatic 事件')
      };
    },
    getState: function () { return { text: st.text }; },
    setState: function (s) { if (s && s.text) st.text = s.text; }
  };
});
