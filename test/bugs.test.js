const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const context={window:{}};vm.createContext(context);
vm.runInContext(html.match(/<script>\s*\/\/ 調整[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g,''),context);
const {CONFIG,Simulation,BridgeEditor,Playback}=context.window.BridgeCore;
let failures=0;
function check(name,fn){try{fn();console.log('PASS:',name)}catch(error){failures++;console.error('FAIL:',name,'—',error.message)}}
check('A terminal frame emits only one car splash and stops substeps immediately',()=>{
 const s=new Simulation({joints:[],members:[]});s.car.falling=true;s.car.y=CONFIG.waterY+.301;s.car.vy=-10;
 s.step(CONFIG.fixedDt);assert.equal(s.outcome,'failure');assert.equal(s.events.filter(e=>e.type==='splash').length,1);
 const t=s.time;s.step(CONFIG.fixedDt);assert.equal(s.time,t);
});
check('Road placement cannot overlap a wooden member and invalidate its own save',()=>{
 const e=new BridgeEditor();assert(e.addWood(0,{x:5,y:0})>=0);assert.equal(e.addRoad(0),false);
 const copy=new BridgeEditor();copy.load(e.export());
});
check('A design built in the editor remains importable beyond 300 members',()=>{
 const e=new BridgeEditor();e.addRoad(0);let start=e.design.joints.findIndex(j=>j.x===5&&j.y===0);
 for(let i=1;i<=301;i++){start=e.addWood(start,{x:5,y:i*5});assert(start>=0)}
 const copy=new BridgeEditor();copy.load(e.export());assert.equal(copy.design.members.length,302);
});
check('A member cannot pass through cliff rock even when both endpoints are allowed',()=>{
 const e=new BridgeEditor();const start=e.point(-2,1);
 const result=e.proposal(start,{x:3,y:1-5*Math.tan(Math.PI/6)});
 assert(result.reason,'The 5m member crosses below ground before reaching x=0');
 const clip={joints:[{x:0,y:0},{x:5*Math.cos(Math.PI/6),y:-2.5}],members:[{a:0,b:1,material:'wood'}]};
 assert(e.pasteProposal(clip,{x:-2,y:1}).reason);
});
check('Broken members no longer leave their entire weight on the connected pins',()=>{
 const s=new Simulation({joints:[{x:0,y:0,fixed:true},{x:0,y:-5,fixed:false}],members:[{a:0,b:1,material:'wood'}]});
 s.car.x=-1000;s.joints[1].y=-6;s.joints[1].py=-6;
 s.step(CONFIG.fixedDt);assert(s.members[0].broken);assert(Math.abs(s.joints[1].mass-CONFIG.jointMass)<1e-8);
});
check('Frame stepping past a finished replay does not repeat the final event',()=>{
 const p=new Playback({joints:[],members:[]});p.frames=[{events:[]},{events:[{type:'splash'}]}];p.replay={cursor:1,end:1,delivered:1};
 p.frameStep();p.frameStep();assert.equal(p.events.length,0);
});
if(failures){console.error(`${failures} regression(s) reproduced`);process.exitCode=1}
