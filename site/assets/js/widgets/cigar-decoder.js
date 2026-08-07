/* ============================================================================
   cigar-decoder — 輸入 CIGAR 字串，看到實際的比對長相
   ----------------------------------------------------------------------------
   這是學生第一個會亂打東西進去的元件，所以錯誤訊息必須「教」，不能只說「格式錯誤」。

   契約：init / render / reset / check / getState / setState
   ============================================================================ */
/* eslint-env browser */
'use strict';

TW.define('cigar-decoder', function (root, cfg) {

  var REF = 'GTTCCAGAGCTTACGGATCCAGTTAC';
  var DEFAULT = cfg.value || '5M1I5M';

  var state = { text: DEFAULT, parsed: null, error: null };
  var stage = root.querySelector('.widget__stage');
  var input = null;

  /* 每個操作碼消耗誰 */
  var OPS = {
    M: { ref: 1, read: 1, label: '對齊（可能吻合，也可能錯配）' },
    '=': { ref: 1, read: 1, label: '完全吻合' },
    X: { ref: 1, read: 1, label: '錯配' },
    I: { ref: 0, read: 1, label: '插入：read 有、參考沒有' },
    D: { ref: 1, read: 0, label: '缺失：參考有、read 沒有' },
    N: { ref: 1, read: 0, label: '跳過參考（RNA splice）' },
    S: { ref: 0, read: 1, label: 'soft clip：read 保留但沒對上' },
    H: { ref: 0, read: 0, label: 'hard clip：read 已被剪掉' },
    P: { ref: 0, read: 0, label: 'padding' }
  };

  /* ---- 解析 ------------------------------------------------------------ */

  function parse(s) {
    s = String(s).trim().toUpperCase();
    if (!s) return { error: '請輸入一段 CIGAR，例如 5M1I5M' };

    var ops = [];
    var re = /(\d+)([MIDNSHPX=])|(.)/g;
    var m;
    while ((m = re.exec(s)) !== null) {
      if (m[3] !== undefined) {
        var ch = m[3];
        if (/\d/.test(ch)) {
          return { error: '「' + ch + '」後面缺少操作碼。CIGAR 的格式是「數字＋字母」成對出現，例如 <code>5M</code>。' };
        }
        return {
          error: '不認識的操作碼「' + ch + '」。合法的是 ' +
                 'M（對齊）、I（插入）、D（缺失）、S（soft clip）、H（hard clip）、N、P、=、X。'
        };
      }
      var n = parseInt(m[1], 10);
      if (n === 0) return { error: '長度不能是 0（<code>0' + m[2] + '</code>）。' };
      ops.push({ n: n, op: m[2] });
    }

    if (!ops.length) return { error: '解析不出任何操作。格式是「數字＋字母」，例如 <code>5M1I5M</code>。' };

    /* 語意檢查：clip 只能在兩端 */
    for (var i = 0; i < ops.length; i++) {
      if ((ops[i].op === 'S' || ops[i].op === 'H') && i !== 0 && i !== ops.length - 1) {
        return { error: '<code>' + ops[i].n + ops[i].op + '</code> 出現在中間。' +
                        'clip 只能出現在 CIGAR 的頭或尾 —— 它代表 read 兩端沒對上的部分。' };
      }
    }

    var refLen = 0, readLen = 0;
    ops.forEach(function (o) {
      refLen += OPS[o.op].ref * o.n;
      readLen += OPS[o.op].read * o.n;
    });

    if (refLen > REF.length) {
      return { error: '這段 CIGAR 需要參考序列有 ' + refLen + ' 個鹼基，' +
                      '但這個示範的參考序列只有 ' + REF.length + ' 個。請縮短輸入序列。' };
    }

    return { ops: ops, refLen: refLen, readLen: readLen };
  }

  /* ---- 繪圖 ------------------------------------------------------------ */

  function paint() {
    var W = 26;            /* 每格寬度 */
    var x0 = 60;
    var H = 250;

    var svg = TW.stage(stage, H, {
      minWide: true,
      title: 'CIGAR 字串對應的比對圖',
      desc: state.error ? '目前輸入無法解析。'
        : '上排是參考序列，下排是 read。灰色格子代表該序列在此處沒有鹼基（gap）。'
    });

    if (state.error) {
      TW.text(x0, 60, '無法解析', 'lbl bad bold', svg);
      return;
    }

    var p = state.parsed;

    /* 標題列 */
    TW.text(20, 24, 'REF', 'tick bold', svg);
    TW.text(20, 96, 'READ', 'tick bold', svg);
    TW.text(20, 150, 'CIGAR', 'tick bold', svg);

    var col = 0, refI = 0, readI = 0;
    var readSeq = buildRead(p);

    p.ops.forEach(function (o) {
      var spec = OPS[o.op];
      for (var k = 0; k < o.n; k++) {
        var x = x0 + col * W;
        if (x > 960) { col++; return; }   /* 超出畫面就不畫 */

        /* --- 參考序列格 --- */
        if (spec.ref) {
          TW.svg('rect', { 'class': 'box plain', x: x, y: 34, width: W - 2, height: 30, rx: 3 }, svg);
          var t1 = TW.text(x + W / 2 - 1, 55, REF[refI] || '·', 'base ' + (REF[refI] || 'n').toLowerCase() + ' mono', svg);
          t1.setAttribute('font-size', '17');
          refI++;
        } else {
          TW.svg('rect', { 'class': 'box ghost', x: x, y: 34, width: W - 2, height: 30, rx: 3 }, svg);
          TW.text(x + W / 2 - 1, 55, '–', 'tick mid', svg);
        }

        /* --- read 格 --- */
        if (spec.read) {
          var isClip = (o.op === 'S');
          TW.svg('rect', {
            'class': isClip ? 'box warn' : 'box plain',
            x: x, y: 106, width: W - 2, height: 30, rx: 3
          }, svg);
          var b = readSeq[readI] || '·';
          var t2 = TW.text(x + W / 2 - 1, 127, b, 'base ' + b.toLowerCase() + ' mono', svg);
          t2.setAttribute('font-size', '17');
          readI++;
        } else {
          TW.svg('rect', { 'class': 'box ghost', x: x, y: 106, width: W - 2, height: 30, rx: 3 }, svg);
          TW.text(x + W / 2 - 1, 127, '–', 'tick mid', svg);
        }

        /* --- 操作碼帶 --- */
        var cls = o.op === 'I' ? 'bar somatic'
                : o.op === 'D' ? 'bar hp2'
                : o.op === 'S' ? 'bar artifact'
                : 'bar';
        TW.svg('rect', { 'class': cls, x: x, y: 160, width: W - 2, height: 22, rx: 3 }, svg);
        var t3 = TW.text(x + W / 2 - 1, 176, o.op, 'tick mid bold mono', svg);
        t3.style.fontSize = '14px';

        col++;
      }
    });

    /* 摘要 */
    var summary = p.ops.map(function (o) { return o.n + o.op; }).join(' ');
    TW.text(20, 212, summary, 'anno mono', svg);
    TW.text(20, 236,
      '消耗參考序列 ' + p.refLen + ' bp　·　消耗 read ' + p.readLen + ' bp' +
      (p.refLen !== p.readLen
        ? '　→ 兩者不同，代表這段比對含有 indel'
        : '　→ 兩者相同，這段比對沒有長度變化'),
      'tick zh', svg);
  }

  /* 依 CIGAR 從參考序列造一條假 read（插入處填 T，方便看出來） */
  function buildRead(p) {
    var out = '', refI = 0;
    p.ops.forEach(function (o) {
      for (var k = 0; k < o.n; k++) {
        var spec = OPS[o.op];
        if (spec.ref && spec.read) { out += REF[refI] || 'N'; refI++; }
        else if (spec.read) { out += 'T'; }
        else if (spec.ref) { refI++; }
      }
    });
    return out;
  }

  /* ---- 控制列 ---------------------------------------------------------- */

  function mountControls() {
    var ctl = root.querySelector('.widget__ctl');

    var lab = document.createElement('label');
    lab.className = 'wctl';
    lab.innerHTML = 'CIGAR <input type="text" class="mono" size="16" value="' + DEFAULT + '">';
    ctl.insertBefore(lab, ctl.firstChild);
    input = lab.querySelector('input');

    var presets = document.createElement('span');
    presets.className = 'wseg';
    presets.innerHTML =
      ['10M', '5M1I5M', '5M2D3M', '10S8M', '3M1D2M2I4M']
        .map(function (v) { return '<button type="button" data-cig="' + v + '">' + v + '</button>'; })
        .join('');
    ctl.insertBefore(presets, ctl.querySelector('[data-act="check"]'));

    input.addEventListener('input', function () {
      state.text = input.value;
      run();
    });
    presets.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cig]');
      if (!b) return;
      state.text = input.value = b.getAttribute('data-cig');
      run();
    });
  }

  function run() {
    var r = parse(state.text);
    if (r.error) { state.error = r.error; state.parsed = null; }
    else { state.error = null; state.parsed = r; }
    paint();
    TW.msg(root, state.error ? '解析失敗' : '', state.error ? false : undefined);

    var note = root.querySelector('.cigar-err');
    if (!note) {
      note = document.createElement('p');
      note.className = 'cigar-err note';
      note.style.margin = '0';
      note.style.padding = '0 1rem 1rem';
      stage.parentNode.insertBefore(note, stage.nextSibling);
    }
    note.innerHTML = state.error || '';
    note.style.display = state.error ? '' : 'none';
    note.style.color = state.error ? 'var(--bad)' : '';
    note.style.borderLeftColor = state.error ? 'var(--bad)' : '';
  }

  /* ---- 契約 ------------------------------------------------------------ */

  return {
    init: function () { mountControls(); run(); },
    render: function () { if (input) input.value = state.text; run(); },
    reset: function () { state.text = DEFAULT; if (input) input.value = DEFAULT; run(); },

    check: function () {
      if (state.error) return { ok: false, message: '請先修正 CIGAR 格式，使其可解析' };
      var p = state.parsed;
      var hasIndel = p.ops.some(function (o) { return o.op === 'I' || o.op === 'D'; });
      var hasClip = p.ops.some(function (o) { return o.op === 'S' || o.op === 'H'; });
      var bits = [];
      if (hasIndel) bits.push('含 indel');
      if (hasClip) bits.push('含 clipping');
      if (!bits.length) bits.push('純對齊，無長度變化');
      return {
        ok: true, score: 1,
        message: '✓ 解析成功：' + bits.join('、') +
                 '（ref ' + p.refLen + ' bp / read ' + p.readLen + ' bp）'
      };
    },

    getState: function () { return { text: state.text }; },
    setState: function (s) { if (s && s.text) state.text = s.text; }
  };
});
