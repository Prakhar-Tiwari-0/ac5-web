// Apache-2.0. Bounded shared stereo ring. Mixer rate is 48 kHz; device may differ.
// Header: producer index, consumer index, underrun frames, overflow frames,
// consumed device frames, active. Single producer/consumer with atomic release.
class Ac5SessionAudio extends AudioWorkletProcessor {
 constructor(options){super();const {ring,capacity}=options.processorOptions;this.header=new Int32Array(ring,0,8);this.samples=new Float32Array(ring,32);this.capacity=capacity;this.phase=0;this.primed=false;}
 process(inputs,outputs){
  const out=outputs[0],h=this.header,cap=this.capacity;
  if(!Atomics.load(h,5)){this.primed=false;this.phase=0;return true;}
  let read=Atomics.load(h,1),write=Atomics.load(h,0),available=(write-read+cap)%cap;
  if(!this.primed){if(available<1600)return true;this.primed=true;}
  const step=48000/sampleRate;let missing=0;
  for(let i=0;i<out[0].length;i++){
   if(available<2){missing++;continue;}
   const next=(read+1)%cap;
   for(let c=0;c<out.length;c++)out[c][i]=this.samples[read*2+(c%2)]*(1-this.phase)+this.samples[next*2+(c%2)]*this.phase;
   this.phase+=step;const advance=Math.floor(this.phase);this.phase-=advance;read=(read+advance)%cap;available-=advance;
  }
  Atomics.store(h,1,read);Atomics.add(h,2,missing);Atomics.add(h,4,out[0].length);return true;
 }
}
registerProcessor('ac5-session-audio',Ac5SessionAudio);
