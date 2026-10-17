// UI tests for shogi.html using jsdom. Run: npm i --no-save jsdom && node test/ui.test.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'shogi.html'), 'utf8');
let failed = 0;
const results = [];

function load() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/shogi.html' });
  const w = dom.window;
  const $ = (id) => w.document.getElementById(id);
  const ev = (code) => w.eval(code);
  // Start every scenario from an empty custom position (no AI scheduled).
  const setup = (side) => {
    w.localStorage.clear();
    $('side').value = String(side);
    ev('resetGame(true);board.fill(null);hands=emptyHands();');
  };
  const fin = () => ev('legalC=null;zCompute();render();');
  const over = () => [$('overTitle').textContent, $('overSub').textContent];
  return { dom, w, $, ev, setup, fin, over };
}

async function test(name, fn) {
  const t = load();
  try {
    await fn(t);
    results.push('ok   ' + name);
  } catch (e) {
    failed++;
    results.push('FAIL ' + name + '\n     ' + (e && e.message || e));
  } finally {
    t.dom.window.close();
  }
}
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await test('page loads in sente mode with the status and no error bar', async ({ $, ev }) => {
    eq($('status').textContent, 'あなたの番（先手）');
    eq(ev('[me,ai,turn]'), [0, 1, 0]);
    eq($('errbar').classList.contains('on'), false);
  });

  await test('level selector offers every engine level, easiest first', async ({ $, ev }) => {
    eq([...$('level').options].map((o) => o.value), ev('LEVELS'));
    eq($('level').options[0].textContent, 'はじめの一歩');
  });

  await test('gote: board is rotated (coordinates and king position)', async ({ $, ev, w, setup }) => {
    setup(1);
    ev('initState();me=1;ai=0;render();');
    eq(w.document.querySelector('.coord.f').textContent, '1');
    eq(w.document.querySelector('.coord.r').textContent, '九');
    // own king (gote, board index 4) is shown on the bottom row (DOM index 76)
    const k = [...w.document.querySelectorAll('.sq')].findIndex((e) => e.getAttribute('aria-label').endsWith('玉') && !e.getAttribute('aria-label').includes('相手'));
    eq(k, 76);
  });

  await test('sente: you checkmate with a gold drop even on move 256 (mate beats the move cap)', async ({ $, ev, setup, fin, over }) => {
    setup(0);
    ev(`board[0]={t:'K',o:1,pr:false};board[80]={t:'K',o:0,pr:false};
        board[1*9+5]={t:'R',o:0,pr:false};board[3*9+1]={t:'R',o:0,pr:false};hands[0].G=1;
        turn=0;moveLog=new Array(255).fill('x');kifLog=new Array(255).fill('');`);
    fin();
    ev(`doPlayerMove(legalMoves().find(m=>m.d==='G'&&m.t===1));`);
    await wait(50);
    eq(over(), ['チェックメイト', 'あなたの勝ちです！']);
  });

  await test('gote: you checkmate (mirrored position)', async ({ ev, setup, fin, over }) => {
    setup(1);
    ev(`board[80]={t:'K',o:0,pr:false};board[0]={t:'K',o:1,pr:false};
        board[66]={t:'R',o:1,pr:false};board[52]={t:'R',o:1,pr:false};hands[1].G=1;turn=1;`);
    fin();
    ev(`doPlayerMove(legalMoves().find(m=>m.d==='G'&&m.t===79));`);
    await wait(50);
    eq(over(), ['チェックメイト', 'あなたの勝ちです！']);
  });

  await test('gote: you are checkmated', async ({ ev, setup, fin, over }) => {
    setup(1);
    ev(`board[0]={t:'K',o:1,pr:false};board[80]={t:'K',o:0,pr:false};
        board[1]={t:'G',o:0,pr:false};board[1*9+5]={t:'R',o:0,pr:false};board[3*9+1]={t:'R',o:0,pr:false};
        turn=1;moveLog=['a','b'];kifLog=['',''];`);
    fin();
    ev('afterMove()');
    await wait(50);
    eq(over(), ['チェックメイト', 'あなたの負けです。']);
  });

  await test('declaration button: disabled at 25 points, enabled at 30, wins (sente)', async ({ $, ev, setup, fin, over }) => {
    setup(0);
    ev(`board[1]={t:'K',o:0,pr:false};board[80]={t:'K',o:1,pr:false};
        for(let c=0;c<9;c++)board[2*9+c]={t:'G',o:0,pr:false};
        board[13]={t:'S',o:0,pr:false};hands[0].R=3;turn=0;`);
    fin();
    eq($('btnDeclare').disabled, true);
    ev('hands[0].R=4;');
    fin();
    eq($('btnDeclare').disabled, false);
    $('btnDeclare').click();
    await wait(50);
    eq(over()[0], '入玉宣言');
    eq($('record').textContent, '1勝 0敗 0引分');
  });

  await test('declaration works for gote too (mirrored)', async ({ $, ev, setup, fin, over }) => {
    setup(1);
    ev(`board[0]={t:'K',o:0,pr:false};board[79]={t:'K',o:1,pr:false};
        for(let c=0;c<9;c++)board[80-(2*9+c)]={t:'G',o:1,pr:false};
        board[67]={t:'S',o:1,pr:false};hands[1].R=4;turn=1;`);
    fin();
    eq($('btnDeclare').disabled, false);
    $('btnDeclare').click();
    await wait(50);
    eq(over()[0], '入玉宣言');
  });

  await test('the AI declares when it can (you lose)', async ({ $, ev, setup, fin, over }) => {
    setup(1);
    ev(`board[80]={t:'K',o:1,pr:false};board[1]={t:'K',o:0,pr:false};
        for(let c=0;c<9;c++)board[2*9+c]={t:'G',o:0,pr:false};
        board[13]={t:'S',o:0,pr:false};hands[0].R=4;turn=0;moveLog=['a','b'];kifLog=['',''];`);
    fin();
    ev('startIfAI()');
    await wait(400);
    eq(over(), ['入玉宣言', '相手が入玉宣言しました。あなたの負けです。']);
    eq($('record').textContent, '0勝 1敗 0引分');
  });

  await test('jishogi: draw at 256 moves; resign loses', async ({ $, ev, setup, fin, over }) => {
    setup(1);
    ev(`board[0]={t:'K',o:1,pr:false};board[80]={t:'K',o:0,pr:false};board[40]={t:'G',o:0,pr:false};
        turn=1;moveLog=new Array(256).fill('x');kifLog=new Array(256).fill('');`);
    fin();
    ev('afterMove()');
    await wait(50);
    eq(over(), ['持将棋', '256手に達したため、引き分けです。']);
    ev(`resetGame(true);board.fill(null);hands=emptyHands();board[0]={t:'K',o:1,pr:false};board[80]={t:'K',o:0,pr:false};turn=1;`);
    fin();
    $('btnResign').click();
    await wait(50);
    eq(over(), ['投了', 'あなたの負けです。']);
    eq($('record').textContent, '0勝 1敗 1引分');
  });

  await test('gote: AI moves first, then autosave resumes as gote with the board rotated', async ({ $, ev, w }) => {
    w.localStorage.clear();
    $('level').value = 'beginner';
    $('side').value = '1';
    $('btnNew').click();
    for (let i = 0; i < 60 && ev('moveLog.length') < 1; i++) await wait(100);
    eq(ev('[me,ai,turn,moveLog.length]'), [1, 0, 1, 1]);
    eq($('status').textContent, 'あなたの番（後手）');
    const saved = w.localStorage.getItem('shogi_autosave');
    if (!saved) throw new Error('no autosave');
    eq(JSON.parse(saved).me, 1);
    eq($('btnUndo').disabled, true, 'undo must be disabled right after the AI first move');
  });

  await test('kifu entries are rendered as text, never as HTML', async ({ ev, w }) => {
    ev(`moveLog=['<img src=x onerror=window.__pwned=1>'];kifLog=[''];kifuRendered=0;document.getElementById('kifu').innerHTML='';renderKifu();`);
    eq(w.document.querySelectorAll('#kifu img').length, 0);
    eq(w.document.querySelector('#kifu .mv').textContent, '▲<img src=x onerror=window.__pwned=1>');
  });

  await test('saved games with a non-string or mismatched record are rejected', async ({ ev }) => {
    eq(ev(`(function(){const s=JSON.parse(JSON.stringify(snapshot()));s.moveLog=['x'];s.kifLog=['y'];
      const ok=validSnap(s);s.moveLog=[5];const bad1=validSnap(s);s.moveLog=['x'];s.kifLog=['y','z'];const bad2=validSnap(s);
      return [ok,bad1,bad2];})()`), [true, false, false]);
  });

  await test('KIF export: header and origin square of the first move', async ({ ev }) => {
    ev('resetGame(true);');
    ev(`doPlayerMove(legalMoves().find(x=>x.f===6*9+2&&x.t===5*9+2));`);
    await wait(50);
    const kif = ev('kifText()');
    const lines = kif.split('\n');
    eq(lines.slice(0, 3), ['手合割：平手', '先手：あなた', lines[2]], kif);
    eq(lines[2].startsWith('後手：AI'), true, kif);
    eq(lines[4], '   1 ７六歩(77)', kif);
  });

  console.log(results.join('\n'));
  console.log(failed ? '\n' + failed + ' test(s) failed' : '\nall UI tests passed');
  process.exit(failed ? 1 : 0);
})();
