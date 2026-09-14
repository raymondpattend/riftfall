import {INPUT_STEP} from './movement';
/** Retain fractional time, but discard pauses beyond half a second. */
export class FixedClock {
 private remainder=0;
 advance(elapsed:number,step:(dt:number)=>void){
  if(!Number.isFinite(elapsed)||elapsed<=0)return;
  this.remainder=Math.min(.5,this.remainder+elapsed);
  while(this.remainder+1e-8>=INPUT_STEP){this.remainder-=INPUT_STEP;step(INPUT_STEP);}
 }
}
