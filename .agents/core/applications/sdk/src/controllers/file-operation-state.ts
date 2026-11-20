/** UI intent guard only. The file service remains the operation ledger and outcome owner. */
export class FileOperationState {
 private state:Readonly<{busy:boolean;operationId:string|null}>=Object.freeze({busy:false,operationId:null});private listeners=new Set<()=>void>();
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private update(change:Partial<typeof this.state>){this.state=Object.freeze({...this.state,...change});for(const listener of this.listeners)listener();}
 begin():boolean{if(this.state.busy||this.state.operationId)return false;this.update({busy:true});return true;}
 beginReconcile():string|null{if(this.state.busy||!this.state.operationId)return null;const id=this.state.operationId;this.update({busy:true});return id;}
 failed(issue:unknown){const id=(issue as {operationId?:unknown})?.operationId;if(typeof id==='string'&&id)this.update({operationId:id});}
 observed(id:string,receipt:{operationId?:string;state?:string}):boolean{
  if(this.state.operationId!==id||receipt.operationId!==id||receipt.state!=='committed')return false;
  this.update({operationId:null});return true;
 }
 end(){this.update({busy:false});}
 canClose=()=>!this.state.busy&&!this.state.operationId;
}
