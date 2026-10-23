// Apache-2.0. Synthetic fixtures never advance retail startup gates.
export const STAGES=['browser','module','memory','entrypoint','assets','graphics','commands','frame','menu','gameplay'];
export class StartupTrace{
 constructor(emit=()=>{}){this.records=[];this.emit=emit;this.last=-1;this.next=0;this.started=performance.now();this.failed=false;}
 record(stage,status,detail={},provenance='host'){
  const index=STAGES.indexOf(stage);if(index<0||!['start','complete','blocked','failed'].includes(status))throw Error('Invalid startup event');
  if(this.failed)throw Error('Startup already failed');
  if(index!==this.next)throw Error('Out-of-order or skipped startup event');
  if(index>0&&status==='complete'&&provenance!=='retail')throw Error('Only actual retail execution can complete game startup stages');
  const r={sequence:this.records.length,stage,index:index+1,status,provenance,elapsedMs:performance.now()-this.started,detail:structuredClone(detail)};this.records.push(r);this.last=index;if(status==='complete')this.next++;
  if(status==='failed'||status==='blocked')this.failed=true;this.emit(r);return r;
 }
}
