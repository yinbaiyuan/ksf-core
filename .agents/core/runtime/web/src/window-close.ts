import {CloseCoordinator,type CloseView} from '../../../applications/sdk/src/controllers/close-coordinator';
import {closeGuards} from './apps/app-services';
const controllers=new Map<string,CloseCoordinator>(),listeners=new Map<string,Set<()=>void>>();
const idle:CloseView=Object.freeze({phase:'idle',request:null,error:null});
export const windowClose={
  get(id:string){return controllers.get(id)?.getSnapshot()??idle;},
  subscribe(id:string,listener:()=>void){let set=listeners.get(id);if(!set){set=new Set();listeners.set(id,set);}set.add(listener);return()=>{set.delete(listener);if(!set.size)listeners.delete(id);};},
  request(id:string,commit:()=>void|Promise<void>){let value=controllers.get(id);if(!value){value=new CloseCoordinator({guards:()=>[async request=>await(closeGuards.get(id)?.(request)??true)?{status:'ready'}:{status:'cancelled'}],commit});controllers.set(id,value);value.subscribe(()=>listeners.get(id)?.forEach(listener=>listener()));}return value.request();},
  release(id:string){controllers.delete(id);},
};
