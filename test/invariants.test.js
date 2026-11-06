// Invariant stress test: mixed random / AI games must never break the rules.
// Run: node test/invariants.test.js [games]   (default 8 games, ~30s)
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'shogi.html'), 'utf8').replace(/\r\n/g, '\n');
const src = html.split('<script id="engineSrc">')[1].split('</script>')[0];
const ctx = vm.createContext({ performance, Math, console, Int32Array, Uint8Array, Map, Set, Array, Object, JSON, Infinity });
vm.runInContext(src, ctx);

const GAMES = +process.argv[2] || 8;
const result = JSON.parse(vm.runInContext(`(function(){
  const res={games:0,plies:0,bad:[]};
  const want={P:18,L:4,N:4,S:4,G:4,B:2,R:2};
  const levels=['novice','starter','beginner','easy','normal'];
  const count=()=>{let n=0,k0=0,k1=0;const per={P:0,L:0,N:0,S:0,G:0,B:0,R:0};
    for(const p of board){if(!p)continue;if(p.t==='K'){p.o?k1++:k0++;}else{n++;per[p.t]++;}}
    for(const o of [0,1])for(const t of HANDS){n+=hands[o][t];per[t]+=hands[o][t];}
    return {n,k0,k1,per};};
  for(let g=0;g<${GAMES};g++){
    initState();
    for(let p=0;p<200&&!res.bad.length;p++){
      const mv=genLegal('all');if(!mv.length)break;
      const m=Math.random()<0.3?mv[(Math.random()*mv.length)|0]:chooseAIMove(levels[(Math.random()*levels.length)|0],40);
      if(!m||!mv.some(x=>x.f===m.f&&x.t===m.t&&(x.d||0)===(m.d||0)&&!!x.pr===!!m.pr)){res.bad.push('illegal move g'+g+' p'+p);break;}
      const mo=turn;applyMove(m);pushRep(mo,inCheck(turn));res.plies++;
      const q=count();
      if(q.n!==38||q.k0!==1||q.k1!==1)res.bad.push('piece count g'+g+' p'+p);
      for(const t in want)if(q.per[t]!==want[t])res.bad.push('piece type '+t+' g'+g+' p'+p);
      const a=[zHi,zLo];zCompute();if(a[0]!==zHi||a[1]!==zLo)res.bad.push('hash g'+g+' p'+p);
      for(let i=0;i<81;i++){const x=board[i];if(!x||x.pr)continue;const r=(i/9)|0;
        if((x.t==='P'||x.t==='L')&&(x.o===0?r===0:r===8))res.bad.push('dead-end '+x.t+' g'+g);
        if(x.t==='N'&&(x.o===0?r<=1:r>=7))res.bad.push('dead-end N g'+g);}
      for(const o of [0,1])for(let c=0;c<9;c++){let n=0;for(let r=0;r<9;r++){const x=board[r*9+c];if(x&&x.o===o&&x.t==='P'&&!x.pr)n++;}if(n>1)res.bad.push('nifu g'+g);}
    }
    res.games++;
    if(res.bad.length)break;
  }
  return JSON.stringify(res);})()`, ctx));

if (result.bad.length) {
  console.log('FAIL invariants: ' + result.bad.slice(0, 5).join('; '));
  process.exit(1);
}
console.log('ok   invariants held over ' + result.games + ' games / ' + result.plies + ' moves');
