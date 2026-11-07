const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const context={window:{}};
vm.createContext(context);
vm.runInContext(html.match(/<script>\s*\/\/ 調整[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g,''),context);
const {CONFIG,configureStage,Simulation,BridgeEditor,Playback}=context.window.BridgeCore;

const firstEditor=new BridgeEditor();
for(let slot=0;slot<5;slot++)assert(firstEditor.addRoad(slot));
const firstSimulation=new Simulation(firstEditor.design);
const legacy={format:'tanigoe-bridge',version:1,design:firstEditor.design};
new BridgeEditor().load(legacy);

configureStage(2);
assert.equal(CONFIG.valleyWidth,37.5);
assert.equal(CONFIG.carCount,3);
assert.equal(CONFIG.carMass*CONFIG.carCount,2550);
assert.equal(firstEditor.config.valleyWidth,25,'Existing editor retains its stage');
assert.equal(firstSimulation.config.valleyWidth,25,'Existing simulation retains its stage');
assert.equal(firstSimulation.cars.length,1);

function buildBridge(bothSides){
 const editor=new BridgeEditor();
 const length=CONFIG.woodLength;
 for(let slot=0;slot<editor.roadSlots;slot++)assert(editor.addRoad(slot));
 const height=length*Math.sqrt(3)/2;
 function connect(x,y,targetX,targetY){
  const start=editor.design.joints.findIndex(joint=>Math.hypot(joint.x-x,joint.y-y)<1e-4);
  assert(start>=0);
  assert(editor.addWood(start,{x:targetX,y:targetY})>=0);
 }
 for(const side of bothSides?[1,-1]:[1]){
  for(let slot=0;slot<5;slot++){
   const x=slot*length;
   connect(x,0,x+length/2,side*height);
   connect(x+length/2,side*height,x+length,0);
   if(slot>0)connect(x-length/2,side*height,x+length/2,side*height);
  }
 }
 return editor;
}

const reinforced=buildBridge(true);
assert.equal(reinforced.roads,5);
assert(reinforced.design.joints.some(joint=>joint.fixed&&joint.x===37.5));
for(const member of reinforced.design.members){
 const a=reinforced.design.joints[member.a],b=reinforced.design.joints[member.b];
 assert(Math.abs(Math.hypot(b.x-a.x,b.y-a.y)-7.5)<1e-4);
}
const exported=reinforced.export();
assert.equal(exported.stage,2);
new BridgeEditor().load(exported);
assert.throws(()=>firstEditor.load(exported),/ステージ2/);
assert.throws(()=>reinforced.load(legacy),/ステージ1/);

// External wheel forces must include every car in the convoy.
const loaded=new Simulation(reinforced.design);
loaded.cars.forEach((car,index)=>car.x=15+index*5);
const selfWeight=loaded.joints.reduce((sum,joint)=>sum+joint.mass*CONFIG.gravity,0);
loaded.substep(CONFIG.fixedDt/CONFIG.substeps);
const applied=-loaded.joints.reduce((sum,joint)=>sum+joint.fy,0)-selfWeight;
assert(Math.abs(applied-3*850*CONFIG.gravity)<1e-6);

// The leading car alone cannot clear the stage.
const finish=new Simulation({joints:[],members:[]});
finish.cars[0].x=40;finish.cars[1].x=-50;finish.cars[2].x=-55;
finish.step(CONFIG.fixedDt);
assert(finish.cars[0].finished);
assert.equal(finish.outcome,null);
finish.cars[1].x=40;finish.cars[2].x=40;
finish.step(CONFIG.fixedDt);
assert.equal(finish.outcome,'success');
const failed=new Simulation({joints:[],members:[]});
failed.cars[2].falling=true;failed.cars[2].y=CONFIG.waterY+.301;failed.cars[2].vy=-10;
failed.step(CONFIG.fixedDt);
assert.equal(failed.outcome,'failure');
assert(failed.events.some(event=>event.type==='splash'&&event.carIndex===2));

let signature;
for(const scale of [1,8]){
 const playback=new Playback(reinforced.design);
 playback.scale=scale;
 for(let frame=0;!playback.sim.outcome&&frame<2000;frame++)playback.tick(1/60);
 assert.equal(playback.sim.outcome,'success');
 assert.equal(playback.sim.breakCount,0);
 assert(playback.sim.cars.every(car=>car.finished));
 assert.equal(playback.frame.cars.length,3);
 const current=JSON.stringify({time:playback.sim.time,cars:playback.frame.cars,joints:playback.frame.joints});
 signature??=current;
 assert.equal(current,signature,'Stage 2 remains deterministic at 8×');
 console.log(`Stage 2 reinforced bridge: success, ${playback.sim.cars.length} cars, peak ${(playback.sim.maxLoad*100).toFixed(1)}%, ${playback.sim.time.toFixed(2)}s`);
}
const weak=new Simulation(buildBridge(false).design);
while(!weak.outcome){weak.step(CONFIG.fixedDt);weak.events.length=0}
assert.equal(weak.outcome,'failure');
configureStage(1);
assert.equal(CONFIG.valleyWidth,25);
console.log('PASS: stage isolation, legacy saves, fixed lengths, 3-car load transmission, all-car success, any-car failure, snapshots and deterministic playback.');
