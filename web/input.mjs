// Apache-2.0. PS2 pad positions match ps2_hle_pad.c, not action names.
export const PAD={SELECT:0,L3:1,R3:2,START:3,UP:4,RIGHT:5,DOWN:6,LEFT:7,L2:8,R2:9,L1:10,R1:11,TRIANGLE:12,CIRCLE:13,CROSS:14,SQUARE:15};
export const KEY={Enter:3,ShiftRight:0,ArrowUp:4,ArrowRight:5,ArrowDown:6,ArrowLeft:7,Digit1:8,Digit3:9,KeyQ:10,KeyE:11,KeyA:12,KeyS:13,KeyX:14,KeyZ:15};
const GP=[14,13,15,12,10,11,8,9,0,3,1,2,4,6,7,5];
export const neutral=()=>({connected:1,buttons:0,lx:127,ly:127,rx:127,ry:127,l2:0,r2:0});
function axis(v,dead=.12){v=Math.max(-1,Math.min(1,Number.isFinite(v)?v:0));if(Math.abs(v)<dead)return 127;return v>=0?127+Math.round(128*v):127+Math.round(127*v);}
export function mapPad(keys,gamepad,mouse={x:0,y:0}){
 const s=neutral();for(const code of keys)if(code in KEY)s.buttons|=1<<KEY[code];
 s.lx=keys.has('Numpad4')?0:keys.has('Numpad6')?255:127;s.ly=keys.has('Numpad8')||keys.has('KeyW')?0:keys.has('Numpad2')?255:127;
 s.rx=axis(mouse.x);s.ry=axis(mouse.y);s.l2=keys.has('Digit1')?255:0;s.r2=keys.has('Digit3')?255:0;
 if(gamepad?.connected){
  if(gamepad.mapping!=='standard')throw Error('Controller has no standard mapping; explicit mapping required');
  for(let i=0;i<GP.length;i++)if(gamepad.buttons[i]?.pressed)s.buttons|=1<<GP[i];
  const axes=['lx','ly','rx','ry'];for(let i=0;i<4;i++)if(Math.abs(gamepad.axes[i]||0)>.12)s[axes[i]]=axis(gamepad.axes[i]);
  s.l2=Math.max(s.l2,Math.round(255*(gamepad.buttons[6]?.value||0)));s.r2=Math.max(s.r2,Math.round(255*(gamepad.buttons[7]?.value||0)));
 }return s;
}
export class BrowserInput{
 constructor(target,publish,onError=console.error){
  this.keys=new Set();this.mouse={x:0,y:0};this.active=false;this.drag=false;this.listeners=[];this.publish=publish;this.onError=onError;
  const on=(obj,name,fn)=>{obj.addEventListener(name,fn);this.listeners.push(()=>obj.removeEventListener(name,fn));};
  this.target=target;target.tabIndex=0;
  on(target,'focus',()=>{this.active=true;});on(target,'blur',()=>this.reset());on(window,'blur',()=>this.reset());
  on(document,'visibilitychange',()=>{if(document.hidden)this.reset();});
  on(target,'keydown',e=>{if(e.code in KEY||e.code.startsWith('Numpad')||e.code==='KeyW'){e.preventDefault();this.keys.add(e.code);this.emit();}});
  on(target,'keyup',e=>{this.keys.delete(e.code);this.emit();});
  on(target,'pointerdown',e=>{target.focus();this.drag=true;target.setPointerCapture(e.pointerId);});
  on(target,'pointermove',e=>{if(this.drag){const r=target.getBoundingClientRect();this.mouse={x:(e.clientX-r.left)/r.width*2-1,y:(e.clientY-r.top)/r.height*2-1};this.emit();}});
  on(target,'pointerup',()=>{this.drag=false;this.mouse={x:0,y:0};this.emit();});on(target,'lostpointercapture',()=>{this.drag=false;this.mouse={x:0,y:0};this.emit();});
  on(window,'gamepaddisconnected',()=>this.emit());on(window,'gamepadconnected',()=>this.emit());
  const poll=()=>{if(this.closed)return;this.emit();this.frame=requestAnimationFrame(poll);};poll();
 }
 emit(){try{const gp=this.active?Array.from(navigator.getGamepads?.()||[]).find(g=>g?.connected):null;this.publish(this.active?mapPad(this.keys,gp,this.mouse):neutral());}catch(e){this.onError(e);this.publish(neutral());}}
 reset(){this.active=false;this.keys.clear();this.mouse={x:0,y:0};this.drag=false;this.publish(neutral());}
 destroy(){this.closed=true;cancelAnimationFrame(this.frame);this.listeners.forEach(f=>f());this.reset();}
}
