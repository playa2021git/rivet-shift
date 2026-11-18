const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const context={window:{}};
vm.createContext(context);
vm.runInContext(html.match(/<script>\s*\/\/ 調整[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g,''),context);
const {CONFIG,configureStage,Simulation,BridgeEditor,Playback}=context.window.BridgeCore;

for(const [stageId,roadLength,step,maxLength] of [[1,5,.5,7.5],[2,7.5,.75,11.25]]){
 configureStage(stageId);
 const editor=new BridgeEditor();
 assert(editor.addRoad(0));
 const roadEnd=editor.design.joints.findIndex(j=>j.x===roadLength&&j.y===0);
 const height=roadLength*.8;
 const apex=editor.addWood(0,{x:0,y:height+step/4});
 assert(apex>=0);
 assert(Math.abs(editor.design.joints[apex].y-height)<1e-9,'A new endpoint snaps to a stepped length');
 assert.equal(editor.addWood(apex,{x:roadLength+.1,y:.1}),roadEnd,'A diagonal snaps to an existing road joint');
 assert.equal(editor.design.joints.length,10,'The triangle shares the existing road endpoints');
 assert.equal(editor.proposal(0,{x:0,y:100}).length,maxLength);
 assert.equal(editor.proposal(0,{x:0,y:.1}).length,roadLength/5);
 for(let ticks=Math.floor(roadLength/(2*step))+1;ticks<=Math.round(maxLength/step);ticks++){
  const length=ticks*step;
  for(const side of [-1,1]){
   for(const fromRight of [false,true]){
    const triangle=new BridgeEditor();
    assert(triangle.addRoad(0));
    const right=triangle.design.joints.findIndex(j=>j.x===roadLength&&j.y===0);
    const start=fromRight?right:0,end=fromRight?0:right;
    const apexY=side*Math.sqrt(length**2-(roadLength/2)**2);
    const aim={x:roadLength/2+.15,y:apexY-.12};
    const proposal=triangle.proposal(start,aim);
    assert(proposal.triangleGuide);
    assert(Math.abs(proposal.length-length)<1e-9);
    const tip=triangle.addWood(start,aim);
    assert.equal(triangle.design.joints[tip].x,roadLength/2);
    assert.equal(triangle.design.joints[tip].y,apexY);
    const close=triangle.proposal(tip,triangle.design.joints[end]);
    assert.equal(close.index,end);
    assert(Math.abs(close.length-length)<1e-9);
    assert.equal(triangle.addWood(tip,triangle.design.joints[end]),end);
    assert(new BridgeEditor().load(triangle.export()));
   }
  }
 }
 const restored=new BridgeEditor();
 assert(restored.load(editor.export()));
 assert.deepEqual(restored.design,editor.design);
 const tooLong=editor.export();
 tooLong.design.joints[apex].y=maxLength+step;
 assert.throws(()=>restored.load(tooLong),/部材の長さ/);
}
configureStage(1);

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
console.log('PASS: stage isolation, legacy saves, stepped wood lengths, joint snapping, 3-car load transmission, all-car success, any-car failure, snapshots and deterministic playback.');
