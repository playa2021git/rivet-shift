const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const source = html.match(/<script>\s*\/\/ 調整[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g, '');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);
const { CONFIG, Simulation, BridgeEditor, Playback, cost, structuralMass } = context.window.BridgeCore;
function bridge(type) {
  const editor = new BridgeEditor();
  for (let k = 0; k < CONFIG.valleyWidth / CONFIG.roadLength; k++) assert(editor.addRoad(k));
  const H = Math.sqrt(CONFIG.woodLength ** 2 - (CONFIG.roadLength / 2) ** 2) * (['below','ballast'].includes(type)?-1:1);
  function connect(x, y, u, v) {
    const start = editor.design.joints.findIndex(j => Math.hypot(j.x - x, j.y - y) < 1e-4);
    assert(start >= 0);
    assert(editor.addWood(start, { x: u, y: v }) >= 0);
  }
  if (type !== 'road') for (let k = 0; k < 5; k++) {
    const x = k * 5;
    connect(x, 0, x + 2.5, H);
    connect(x + 2.5, H, x + 5, 0);
    if (['truss','below','ballast'].includes(type) && k > 0) connect(x - 2.5, H, x + 2.5, H);
  }
  if(type==='ballast')for(let i=0;i<11;i++)connect(12.5,H-i*CONFIG.woodLength,12.5,H-(i+1)*CONFIG.woodLength);
  return editor;
}
function run(design, scale = 1) {
  const sim = new Simulation(design);
  let frames = 0;
  while (!sim.outcome && frames++ < 1801) {
    // Playback speed changes the number of fixed steps, never the step size.
    for (let n = 0; n < scale && !sim.outcome; n++) {
      sim.step(CONFIG.fixedDt);
      assert(sim.joints.every(j => Number.isFinite(j.x) && Number.isFinite(j.y)));
      sim.events.length = 0;
    }
  }
  return sim;
}
// The unsupported road must fail under its own weight, before a wheel enters it.
// Place the car far away to isolate structural self-weight without changing the solver.
const selfWeight = new Simulation(bridge('road').design);
selfWeight.car.x=-1000;
while(!selfWeight.breakCount && selfWeight.time<1) {
  selfWeight.step(CONFIG.fixedDt);
  selfWeight.events.length=0;
}
const firstWheelArrival=(4-CONFIG.wheelbase/2)/CONFIG.carSpeed;
assert(selfWeight.breakCount>0,'Road-only bridge must break from self-weight');
assert(selfWeight.time<firstWheelArrival,'Failure must occur before any car load reaches the bridge');
console.log(`Unsupported road self-weight failure: ${selfWeight.time.toFixed(3)}s; earliest wheel arrival ${firstWheelArrival.toFixed(3)}s`);
// Both building and JSON/paste validation must allow construction above/below old limits.
const unrestricted=new BridgeEditor();
unrestricted.addRoad(0);
let upper=unrestricted.design.joints.findIndex(j=>j.x===5&&j.y===0);
for(const y of [5,10,15]){upper=unrestricted.addWood(upper,{x:5,y});assert(upper>=0)}
let lower=unrestricted.design.joints.findIndex(j=>j.x===5&&j.y===0);
for(const y of [-5,-10,-15]){lower=unrestricted.addWood(lower,{x:5,y});assert(lower>=0)}
const unrestrictedImport=new BridgeEditor();unrestrictedImport.load(unrestricted.export());
assert(unrestrictedImport.validPoint({x:10,y:100}));
assert(unrestrictedImport.validPoint({x:10,y:-100}));
assert(!unrestrictedImport.validPoint({x:-1,y:-3}),'Cliff interior remains blocked');
assert(!unrestrictedImport.validPoint({x:Infinity,y:0}));
const upperClip=unrestricted.copy([1]);
assert(!unrestricted.pasteProposal(upperClip,{x:15,y:15}).reason);
assert(!unrestricted.pasteProposal(upperClip,{x:15,y:-20}).reason);
// Budget is informational only, for building, pasting, file import and road repair.
const noBudgetCap=new BridgeEditor();
for(let k=0;k<noBudgetCap.roadSlots;k++)assert(noBudgetCap.addRoad(k));
let tower=noBudgetCap.design.joints.findIndex(j=>j.x===5&&j.y===0);
for(let k=1;k<=20;k++){tower=noBudgetCap.addWood(tower,{x:5,y:k*CONFIG.woodLength});assert(tower>=0)}
assert(cost(noBudgetCap.design)>CONFIG.budget);
const overBudgetClip=noBudgetCap.copy([5]);
assert(noBudgetCap.paste(overBudgetClip,{x:10,y:0}));
assert(noBudgetCap.remove(0));assert(noBudgetCap.addRoad(0));
const overBudgetImport=new BridgeEditor();overBudgetImport.load(noBudgetCap.export());
assert.equal(cost(overBudgetImport.design),cost(noBudgetCap.design));
// Water is an effect surface, never a floor supporting hanging bridge members.
const underwaterFall=new Simulation({joints:[{x:12,y:CONFIG.waterY+.1,fixed:false}],members:[]});
underwaterFall.car.x=-1000;
let crossings=0;
for(let k=0;k<120;k++){underwaterFall.step(CONFIG.fixedDt);crossings+=underwaterFall.events.filter(e=>e.type==='splash').length;underwaterFall.events.length=0}
assert(underwaterFall.joints[0].y<CONFIG.waterY-5,'Falling joints continue well below the surface');
assert(underwaterFall.joints[0].vy<0,'Water must not zero falling velocity');
assert.equal(crossings,1,'Crossing the water produces one splash');
const underwaterChain=new Simulation({joints:[0,-5,-10,-15,-20].map((y,i)=>({x:0,y,fixed:i===0})),members:[0,1,2,3].map(i=>({a:i,b:i+1,material:'wood'}))});
underwaterChain.car.x=-1000;
for(let k=0;k<120;k++){underwaterChain.step(CONFIG.fixedDt);underwaterChain.events.length=0}
assert.equal(underwaterChain.breakCount,0);
assert(underwaterChain.joints[4].y<CONFIG.waterY-5,'Connected underwater weights are not clamped up to the surface');
assert(underwaterChain.members[0].force>underwaterChain.members[3].force&&underwaterChain.members[3].force>0,'Underwater self-weight still pulls on members above it');
// Independent statics check: measured top tension equals all hanging mass times g.
for(const count of [1,4,12]){
  const hanging=new Simulation({joints:Array.from({length:count+1},(_,i)=>({x:12,y:-i*CONFIG.woodLength,fixed:i===0})),members:Array.from({length:count},(_,i)=>({a:i,b:i+1,material:'wood'}))});
  hanging.car.x=-1000;
  const expected=hanging.joints.filter(j=>!j.fixed).reduce((sum,j)=>sum+j.mass*CONFIG.gravity,0);
  for(let k=0;k<360;k++){hanging.step(CONFIG.fixedDt);hanging.events.length=0}
  assert.equal(hanging.breakCount,0);
  assert(Math.abs(hanging.members[0].force-expected)/expected<.01,'Hanging mass must transmit its complete weight, including underwater');
}
const lowerBridge=bridge('below'),heavyBridge=bridge('ballast');
assert(Math.abs(structuralMass(heavyBridge.design)-structuralMass(lowerBridge.design)-11*(CONFIG.woodLength*CONFIG.materials.wood.density+CONFIG.jointMass))<1e-6);
assert.equal(run(lowerBridge.design).outcome,'success');
const overloaded=run(heavyBridge.design);
assert.equal(overloaded.outcome,'failure');assert(overloaded.breakCount>0);
console.log('PASS: hanging tension matches weight within 1%; a normal lower truss passes and 11 extra hanging members overload it.');
for (const type of ['road', 'truss', 'noTop']) {
  const editor = bridge(type);
  const sim = run(editor.design);
  console.log(`${type}: ${sim.outcome}, peak ${(sim.maxLoad * 100).toFixed(1)}%, ¥${cost(editor.design)}`);
  assert.equal(sim.outcome, type === 'truss' ? 'success' : 'failure');
  if (type === 'truss') {
    assert(sim.maxLoad >= .55 && sim.maxLoad <= .8, 'Truss load must reach yellow/orange (55–80%).');
    assert.equal(sim.breakCount, 0);
    assert.equal(editor.design.members.filter(m => m.material === 'wood').length, 14);
    const fast = run(editor.design, 8);
    assert.equal(fast.outcome, sim.outcome);
    assert.equal(fast.time, sim.time);
    assert.equal(fast.maxLoad, sim.maxLoad);
  }
}
const editor = bridge('truss');
const original = JSON.stringify(editor.design);
assert(editor.removeMany(editor.design.members.map((_, i) => i).filter(i => i >= 5)));
const used = new Set(editor.design.members.flatMap(m => [m.a, m.b]));
assert(editor.design.joints.every((j, i) => j.fixed || used.has(i)));
assert(editor.undo());
assert.equal(JSON.stringify(editor.design), original);
assert(editor.redo());
assert.equal(editor.design.members.length, 5);
assert(editor.undo());
const clip = editor.copy([5, 6]);
assert(clip && clip.members.length === 2);
assert(editor.pasteProposal(clip, editor.design.joints[editor.design.members[5].a]).reason);
assert(editor.pasteProposal(clip, { x: -20, y: -3 }).reason);
const exported = editor.export();
const imported = new BridgeEditor();
imported.load(exported);
assert.equal(JSON.stringify(imported.design), original);
const corrupt = JSON.parse(JSON.stringify(exported));
corrupt.design.members[0].a = 9999;
assert.throws(() => imported.load(corrupt));
const history = new BridgeEditor();
for (let n = 0; n < 120; n++) history.clear();
assert.equal(history.history.length, CONFIG.historyLimit);
console.log('PASS: physical outcomes, fixed-step playback, pruning, batch undo/redo, file validation, paste rules, history limit.');
// Verify the actual accumulator, including sub-1× speeds, rather than only grouping steps.
let baseline;
for (const scale of [.1,.25,.5,1,2,4,8]) {
  const player = new Playback(bridge('truss').design);
  player.scale=scale;
  let renders=0;
  while(!player.sim.outcome&&renders++<20000) player.tick(1/60);
  assert.equal(player.sim.outcome,'success');
  const signature=JSON.stringify({time:player.sim.time,load:player.sim.maxLoad,joints:player.sim.joints.map(j=>[j.x,j.y])});
  baseline??=signature;
  assert.equal(signature,baseline,`${scale}× must produce identical simulation state`);
  player.paused=true;
  const time=player.sim.time;player.tick(1);assert.equal(player.sim.time,time);
}
const replay = new Playback(bridge('noTop').design);
while(!replay.sim.outcome) replay.tick(1/60);
assert(replay.firstBreak);
const finalTime=replay.sim.time;
assert(replay.startReplay());
assert(Math.abs(replay.frame.time-(replay.firstBreak.time-.5))<CONFIG.fixedDt*1.1);
const replayTime=replay.frame.time;replay.tick(1);
assert(Math.abs(replay.frame.time-replayTime-.25)<CONFIG.fixedDt*1.1);
assert.equal(replay.sim.time,finalTime,'Replay never re-simulates or mutates the physical result');
const isolated=new BridgeEditor();isolated.addRoad(0);isolated.remove(0);
assert(isolated.design.joints.every(j=>j.fixed));
assert(isolated.undo());assert(isolated.redo());assert(isolated.design.joints.every(j=>j.fixed));
console.log('PASS: 0.1×–8× accumulator produces bit-identical outcomes; replay starts 0.5s before the first break at 0.25×; no orphan joints after redo.');
