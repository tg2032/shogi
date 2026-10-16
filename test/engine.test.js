// Engine tests for shogi.html (no dependencies). Run: node test/engine.test.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'shogi.html'), 'utf8').replace(/\r\n/g, '\n');
const src = html.split('<script id="engineSrc">')[1].split('</script>')[0];
const ctx = vm.createContext({ performance, Math, console, Int32Array, Uint8Array, Map, Set, Array, Object, JSON, Infinity });
vm.runInContext(src, ctx);
const run = (code) => vm.runInContext(code, ctx);

let failed = 0;
function test(name, fn) {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.message || e)); }
}
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (c, msg) => { if (!c) throw new Error(msg || 'assertion failed'); };

test('perft from the initial position (30 / 900 / 25470)', () => {
  eq(run(`initState();
    function perft(d){ if(d===0)return 1; let n=0; for(const m of genLegal('all')){const i=applyMove(m); n+=perft(d-1); revertMove(m,i);} return n;}
    [1,2,3].map(perft)`), [30, 900, 25470]);
});

test('incremental Zobrist hash equals a recompute (random games)', () => {
  eq(run(`(function(){
    let bad=0;
    for(let g=0;g<15;g++){initState();
      for(let p=0;p<120;p++){const mv=genLegal('all');if(!mv.length)break;
        applyMove(mv[(Math.random()*mv.length)|0]);
        const a=[zHi,zLo];zCompute();if(a[0]!==zHi||a[1]!==zLo)bad++;zHi=a[0];zLo=a[1];}}
    return bad;})()`), 0);
});

test('apply/revert restores board, hands and hash', () => {
  eq(run(`(function(){
    initState();let bad=0;
    for(let p=0;p<60;p++){const mv=genLegal('all');if(!mv.length)break;
      const m=mv[(Math.random()*mv.length)|0];
      const before=posKey()+'|'+zHi+'|'+zLo;
      const i=applyMove(m);revertMove(m,i);
      if(before!==posKey()+'|'+zHi+'|'+zLo)bad++;
      applyMove(m);}
    return bad;})()`), 0);
});

test('nifu (double pawn) and dead-end drops are not generated', () => {
  eq(run(`(function(){
    initState();board.fill(null);hands=emptyHands();
    board[8*9+4]={t:'K',o:0,pr:false};board[0*9+4]={t:'K',o:1,pr:false};
    board[6*9+2]={t:'P',o:0,pr:false};hands[0].P=1;hands[0].L=1;hands[0].N=1;turn=0;legalC=null;zCompute();
    const d=genLegal('all').filter(m=>m.d);
    return {pawnOnFile2:d.some(m=>m.d==='P'&&m.t%9===2),
            pawnOnLastRank:d.some(m=>m.d==='P'&&((m.t/9)|0)===0),
            lanceOnLastRank:d.some(m=>m.d==='L'&&((m.t/9)|0)===0),
            knightOnRank01:d.some(m=>m.d==='N'&&((m.t/9)|0)<=1)};})()`),
    { pawnOnFile2: false, pawnOnLastRank: false, lanceOnLastRank: false, knightOnRank01: false });
});

test('pawn-drop checkmate (uchifuzume) is forbidden, other pawn drops are not', () => {
  // Gote king at 9a boxed in by its own pawns at 8a / 9b; a sente gold on 8c protects 9b.
  // Dropping a pawn on 9b would be checkmate, so it must not be generated.
  eq(run(`(function(){
    initState();board.fill(null);hands=emptyHands();
    board[0]={t:'K',o:1,pr:false};board[8*9+8]={t:'K',o:0,pr:false};
    board[0*9+1]={t:'P',o:1,pr:false};board[1*9+1]={t:'P',o:1,pr:false};
    board[2*9+1]={t:'G',o:0,pr:false};
    hands[0].P=1;turn=0;legalC=null;zCompute();
    // sanity: the drop really would mate
    const m={f:-1,t:1*9+0,d:'P',pr:false};const i=applyMove(m);
    const mates=inCheck(1)&&genLegal('all').length===0;revertMove(m,i);
    const drops=genLegal('all').filter(x=>x.d==='P');
    return {wouldMate:mates,dropOnMatingSquare:drops.some(x=>x.t===1*9+0),otherDropsExist:drops.some(x=>x.t===4*9+4)};})()`),
    { wouldMate: true, dropOnMatingSquare: false, otherDropsExist: true });
});

test('forced promotion: a pawn reaching the last rank must promote', () => {
  eq(run(`(function(){
    initState();board.fill(null);hands=emptyHands();
    board[8*9+8]={t:'K',o:0,pr:false};board[0*9+8]={t:'K',o:1,pr:false};
    board[1*9+4]={t:'P',o:0,pr:false};turn=0;legalC=null;zCompute();
    return genLegal('all').filter(m=>m.f===1*9+4).map(m=>m.pr);})()`), [true]);
});

test('checkmate is found in one move (golden drop) with a mate score', () => {
  eq(run(`(function(){
    initState();board.fill(null);hands=emptyHands();
    board[0]={t:'K',o:1,pr:false};board[8*9+8]={t:'K',o:0,pr:false};
    board[1*9+5]={t:'R',o:0,pr:false};board[3*9+1]={t:'R',o:0,pr:false};hands[0].G=1;
    turn=0;legalC=null;zCompute();
    const m=chooseAIMove('hard',800);
    return {d:m.d,t:m.t,mate:rootScore>=MATE-1000};})()`), { d: 'G', t: 1, mate: true });
});

test('declaration (27-point rule): points, camp count and check', () => {
  const r = run(`(function(){
    initState();board.fill(null);hands=emptyHands();
    board[1]={t:'K',o:0,pr:false};board[8*9+8]={t:'K',o:1,pr:false};
    for(let c=0;c<9;c++)board[2*9+c]={t:'G',o:0,pr:false};
    board[1*9+4]={t:'S',o:0,pr:false};
    turn=0;const a=declareInfo(0);          // 10 pieces, 10 points
    hands[0].R=3;const b=declareInfo(0);    // 25 points
    hands[0].R=4;const c=declareInfo(0);    // 30 points
    board[4*9+1]={t:'R',o:1,pr:false};board[2*9+1]=null; // rook checks the king
    const d=declareInfo(0);
    return {a:a.ok,b:b.ok,c:c.ok,pts:c.pts,d:d.ok};})()`);
  eq(r, { a: false, b: false, c: true, pts: 30, d: false });
});

test('every difficulty level plays only legal moves (self-play)', () => {
  eq(run(`(function(){
    initState();let bad=0;
    for(let p=0;p<80;p++){const mv=genLegal('all');if(!mv.length)break;
      const m=chooseAIMove(LEVELS[p%5],120);
      if(!m||!mv.some(x=>x.f===m.f&&x.t===m.t&&(x.d||0)===(m.d||0)&&!!x.pr===!!m.pr)){bad++;break;}
      const mo=turn;applyMove(m);pushRep(mo,inCheck(turn));
      if(kingIdx(0)<0||kingIdx(1)<0){bad++;break;}}
    return bad;})()`), 0);
});

console.log(failed ? '\n' + failed + ' test(s) failed' : '\nall tests passed');
process.exit(failed ? 1 : 0);
