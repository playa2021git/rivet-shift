// Exercises the actual UI handlers with real Three.js geometry and camera math.
// Only the browser DOM, WebGL drawing surface and audio hardware are replaced.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
async function main(){
 const testStage=Number(process.argv[2]||1);
 const root=path.join(__dirname,'..');
 const THREE=await import(pathToFileURL(path.join(root,'vendor/three.module.min.js')).href);
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const core=html.match(/<script>\s*\/\/ 調整[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g,'');
 const source=html.match(/<script type="module" id="gameModule">([\s\S]*?)<\/script>/)[1].replace("const THREE=globalThis.__LOCAL_THREE__ || await import('three');",'');
 class Element{
  constructor(id='',tagName='BUTTON'){this.id=id;this.tagName=tagName;this.style={};this.handlers={};this.value='1';this.checked=false;this.disabled=false;this.hidden=false;this.textContent='';this.classList={values:new Set(),toggle:(v,force)=>{if(force===undefined)force=!this.classList.values.has(v);force?this.classList.values.add(v):this.classList.values.delete(v);return force},contains:v=>this.classList.values.has(v)}}
  addEventListener(type,handler){(this.handlers[type]??=[]).push(handler)}
  setPointerCapture(){}
  click(){if(!this.disabled)this.onclick?.({target:this})}
 }
 const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element(m[1])]));
 const canvas=new Element('gameCanvas','CANVAS'),globalHandlers={},storage=new Map([['tanigoe.settings.v2',JSON.stringify({se:'broken',bgm:999,muted:'false',bgmMuted:null})]]);
 const document={hidden:false,body:{prepend(){}},createElement:tag=>new Element('',tag.toUpperCase()),getElementById:id=>{assert(elements.has(id),`Missing element ${id}`);return elements.get(id)},addEventListener(){}};
 class Renderer{constructor(){this.domElement=canvas}setPixelRatio(){}setSize(){}render(){}}
 class AudioParam{constructor(){this.value=0}setValueAtTime(v){this.value=v}exponentialRampToValueAtTime(v){this.value=v}setTargetAtTime(v){this.value=v}}
 class AudioNode{constructor(){this.gain=new AudioParam();this.frequency=new AudioParam()}connect(node){return node}disconnect(){}start(){}stop(){}}
 class AudioContext{constructor(){this.currentTime=0;this.state='suspended';this.sampleRate=22050;this.destination=new AudioNode();this.nodes=[]}resume(){this.state='running';return Promise.resolve()}suspend(){this.state='suspended';return Promise.resolve()}createGain(){return new AudioNode()}createOscillator(){const node=new AudioNode();this.nodes.push(node);return node}createBufferSource(){const node=new AudioNode();this.nodes.push(node);return node}createBiquadFilter(){return new AudioNode()}createBuffer(_,n){const data=new Float32Array(n);return{getChannelData:()=>data}}}
 const location={href:`https://rivet-shift.test/?stage=${testStage}`,assign(url){this.lastAssignment=url}};
 const context={location,window:{AudioContext},document,THREE:{...THREE,WebGLRenderer:Renderer},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},innerWidth:1366,innerHeight:768,devicePixelRatio:1,performance:{now:()=>0},requestAnimationFrame(){},addEventListener:(type,handler)=>(globalHandlers[type]??=[]).push(handler),setTimeout:()=>0,Blob,URL,console};
 vm.createContext(context);vm.runInContext(core,context);
 vm.runInContext(source+`;window.testing={editor,view,target,audio,settings,carModels,storeKey:STORE,canvas:renderer.domElement,chosen,worldAt,updateCamera,animate,run,reset,showResult,startPaste,updatePaste,deleteChosen,copyChosen,get play(){return play},get mode(){return mode},get selected(){return selected},get pasteMode(){return pasteMode},project(x,y){const p=new THREE.Vector3(x,y,0).project(camera);return{x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2}}};`,context);
 const game=context.window.testing;
 assert.equal(game.settings.se,.35);assert.equal(game.settings.bgm,.5);assert.equal(game.settings.muted,false);assert.equal(game.settings.bgmMuted,false);
 function key(key,opts={}){for(const handler of globalHandlers.keydown??[])handler({key,code:key===' '?'Space':key,target:{tagName:'BODY'},preventDefault(){},...opts})}
 function clickWorld(x,y,button=0){const p=game.project(x,y),event={clientX:p.x,clientY:p.y,button,pointerId:1,pointerType:'mouse',preventDefault(){}};for(const fn of canvas.handlers.pointerdown)fn(event);for(const fn of globalHandlers.pointerup??[])fn(event)}
 const length=game.editor.config.roadLength;
 assert.equal(game.carModels.length,testStage===2?3:1);
 for(let i=0;i<5;i++)clickWorld(i*length+length/2,0);
 assert.equal(game.editor.roads,5);assert.equal(game.mode,'wood');
 // Select a real node, place a fixed-length wooden member, undo and redo it.
 clickWorld(length,0);assert.notEqual(game.selected,null);clickWorld(length*1.5,length*Math.sqrt(3)/2);
 assert.equal(game.editor.design.members.length,6);
 key('z',{ctrlKey:true});assert.equal(game.editor.design.members.length,5);
 assert(game.editor.design.joints.every((j,i)=>j.fixed||game.editor.design.members.some(m=>m.a===i||m.b===i)));
 key('y',{ctrlKey:true});assert.equal(game.editor.design.members.length,6);
 key('a',{ctrlKey:true});assert.equal(game.chosen.size,1);
 key('c',{ctrlKey:true});key('v',{ctrlKey:true});assert(game.pasteMode);
 const paste=game.updatePaste({x:length*2,y:0});assert(!paste.reason);
 clickWorld(length*2,0);assert.equal(game.editor.design.members.length,7);
 key('a',{ctrlKey:true});elements.get('deleteSelection').click();assert.equal(game.editor.design.members.length,5);
 key('z',{ctrlKey:true});assert.equal(game.editor.design.members.length,7);
 assert(storage.has(game.storeKey));
 elements.get('start').click();assert(game.play);
 elements.get('speed').value='8';elements.get('speed').onchange({target:elements.get('speed')});
 game.animate(16.6667);assert(game.play.sim.time>0.1);
 elements.get('pause').click();assert(game.play.paused);
 const before=game.play.sim.time;game.animate(33.3334);assert.equal(game.play.sim.time,before);
 elements.get('step').click();assert(game.play.sim.time>before);
 elements.get('pause').click();
 for(let i=3;i<400&&!game.play.sim.outcome;i++)game.animate(i*16.6667);
 assert.equal(game.play.sim.outcome,'failure');assert(game.play.firstBreak);
 elements.get('replay').click();assert(game.play.replay);
 assert(Math.abs(game.play.frame.time-(Math.max(0,game.play.firstBreak.time-.5)))<.02);
 for(let i=400;i<420;i++)game.animate(i*16.6667);
 assert(game.play.frame.time<game.play.firstBreak.time+.1);
 elements.get('replayExit').click();assert(!game.play.replay);
 elements.get('reset').click();assert(!game.play);assert.equal(game.editor.design.members.length,7);
 elements.get('orbit').click();assert(elements.get('start').disabled);elements.get('orbit').click();
 // The chosen pan tool must not steal a rotation drag.
 elements.get('pan').click();elements.get('orbit').click();const orbitX=game.target.x;
 const orbitEvent={clientX:700,clientY:300,button:0,pointerId:4,pointerType:'mouse',preventDefault(){}};
 for(const fn of canvas.handlers.pointerdown)fn(orbitEvent);
 for(const fn of canvas.handlers.pointermove)fn({...orbitEvent,clientX:740});
 for(const fn of globalHandlers.pointerup??[])fn({...orbitEvent,clientX:740});
 game.animate(7500);assert(Math.abs(game.view.yaw)>.01);assert.equal(game.target.x,orbitX);
 elements.get('orbit').click();
 // Trackpad navigation and cursor-centred zoom use the real orthographic camera.
 const panStart=game.target.x;
 key(' ',{code:'Space'});
 const panEvent={clientX:700,clientY:300,button:0,pointerId:3,pointerType:'mouse',preventDefault(){}};
 for(const fn of canvas.handlers.pointerdown)fn(panEvent);
 for(const fn of canvas.handlers.pointermove)fn({...panEvent,clientX:760});
 for(const fn of globalHandlers.pointerup??[])fn({...panEvent,clientX:760});
 for(const fn of globalHandlers.keyup??[])fn({key:' ',code:'Space'});
 assert(game.target.x<panStart);
 game.animate(8000);
 const pointBefore=game.worldAt(800,350);
 for(const fn of canvas.handlers.wheel)fn({clientX:800,clientY:350,deltaY:-180,preventDefault(){}});
 const pointAfter=game.worldAt(800,350);
 assert(Math.hypot(pointBefore.x-pointAfter.x,pointBefore.y-pointAfter.y)<1e-6);
 assert.equal(elements.get('replayExit').hidden,true);
 // File.text() is asynchronous: starting a test while decoding must not replace the live design.
 const fileInput=elements.get('fileInput'),beforeImport=JSON.stringify(game.editor.design);
 let finishRead;fileInput.files=[{size:100,text:()=>new Promise(resolve=>finishRead=resolve)}];
 const pendingImport=fileInput.onchange({target:fileInput});
 game.run();assert(game.play);
 finishRead(JSON.stringify(new game.editor.constructor().export()));await pendingImport;
 assert.equal(JSON.stringify(game.editor.design),beforeImport);assert(elements.get('status').textContent.includes('テスト中'));
 game.reset();
 // Synthesizer scheduling, voice cap and independent SE/BGM switches.
 await game.audio.unlock();
 assert.equal(game.audio.bgm.gain.value,0,'BGM is opt-in on every page load');
 assert.equal(game.audio.ctx.nodes.length,0,'Unlock must not start a permanent humming oscillator');
 for(let i=0;i<120;i++){game.audio.ctx.currentTime+=1/60;game.audio.tick(true,.4,4,true)}
 assert.equal(game.audio.ctx.nodes.length,0,'Driving alone stays silent with BGM off');
 game.audio.effect('break');const voices=game.audio.voices;
 game.audio.effect('break');assert.equal(game.audio.voices,voices,'80ms duplicate guard');
 for(let i=0;i<30;i++){game.audio.ctx.currentTime+=.1;game.audio.effect('break')}
 assert(game.audio.voices<=12,'Global polyphony cap');
 for(const node of game.audio.ctx.nodes)node.onended?.();
 game.settings.muted=true;game.audio.update();const mutedVoices=game.audio.voices;game.audio.effect('place');assert.equal(game.audio.voices,mutedVoices);
 await elements.get('bgmToggle').onclick();assert(game.audio.bgm.gain.value>0,'BGM is independent of the SE mute');
 game.audio.tick(false,0,0);assert(game.audio.voices>mutedVoices,'BGM actually schedules synthesized notes');
 elements.get('bgmMute').click();assert.equal(game.audio.bgm.gain.value,0);
 assert(storage.has('tanigoe.settings.v2'));
 // Insets at 1366×768 are fixed by CSS; no collision with the bottom bar.
 assert(html.includes('max-height:calc(100vh - 158px)'));
 elements.get('stageSelect').onchange({target:{value:testStage===1?'2':'1'}});
 assert.equal(new URL(location.lastAssignment).searchParams.get('stage'),testStage===1?'2':'1');
 assert.equal(JSON.parse(storage.get(game.storeKey)).stage,testStage);
 console.log('PASS: real UI handlers, raycast placement, hotkeys, pruning, redo, copy/paste, atomic range delete, autosave, 8× playback, pause/frame step, first-break replay, orbit edit lock.');
 console.log('PASS: Space-drag navigation, cursor-centred zoom, SE throttle/polyphony, opt-in BGM scheduling, independent mute and saved sound settings.');
 console.log('PASS: invalid saved sound settings are normalized; pan tool does not override orbit; pending imports cannot replace an active simulation.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
