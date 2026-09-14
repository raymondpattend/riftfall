import type {CommandResult,Packet} from './protocol';
import type {GameEvent,Snapshot} from './rules';
/** One replaceable state in flight; events/results stay reliable until its acknowledgment. */
export class SnapshotDelivery {
 private serial=0;private flight:{id:number;at:number;events:number;results:number}|null=null;
 private events:GameEvent[]=[];private results:CommandResult[]=[];
 clearEvents(){this.events=[];if(this.flight)this.flight.events=0;}
 bytes=0;sends=0;acknowledged=0;
 event(event:GameEvent){this.events.push(event);}
 result(result:CommandResult){this.results.push(result);}
 expired(now:number){return !!this.flight&&now-this.flight.at>2000||this.events.length>512||this.results.length>128;}
 ack(id:number){if(id!==this.flight?.id)return;this.events.splice(0,this.flight.events);this.results.splice(0,this.flight.results);this.acknowledged=id;this.flight=null;}
 next(snapshot:Snapshot,now:number):Packet|null{
  if(this.flight)return null;
  const delivery=++this.serial;
  const packet:Packet={type:'snapshot',delivery,snapshot:{...snapshot,events:[...this.events]},results:[...this.results]};
  this.flight={id:delivery,at:now,events:this.events.length,results:this.results.length};this.sends++;this.bytes+=new TextEncoder().encode(JSON.stringify(packet)).length;
  return packet;
 }
}
