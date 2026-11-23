export const fileParent=path=>path.slice(0,path.lastIndexOf('/'));
export const fileName=path=>path.slice(path.lastIndexOf('/')+1);
export const fileWithin=(path,folder)=>path===folder||path.startsWith(folder+'/');
export function renameTarget(path,name){
  name=name.trim();
  if(!name||['.','..'].includes(name)||/[\\/\x00-\x1f\x7f]/.test(name))throw Error('请输入有效名称，不能包含路径分隔符。');
  return fileParent(path)+'/'+name;
}
export function moveTarget(source,folder,root){
  if(!fileWithin(folder,root)||folder.split('/').some(part=>!part||['.','..'].includes(part))||/[\\\x00-\x1f\x7f]/.test(folder))throw Error('请选择当前项目中的目标文件夹。');
  if(source.kind==='directory'&&fileWithin(folder,source.path))throw Error('不能将文件夹移动到自身或子文件夹。');
  return folder+'/'+fileName(source.path);
}
const rejected=code=>['WORKSPACE_CONFLICT','WORKSPACE_EXISTS','WORKSPACE_READONLY','WORKSPACE_PROTECTED','WORKSPACE_SYMLINK','FILE_MOVE_INVALID','WORKSPACE_MOVE_INVALID','FILE_PATH_INVALID','FILE_SCOPE_INVALID','FILE_CROSS_DEVICE','FILE_ROOT_PROTECTED','FILE_PATH_PROTECTED','APP_DATA_MANAGED','FILE_OPERATION_INVALID','FILE_CONFIRM_REQUIRED','FILE_READONLY','FILE_PROTECTED','PROJECT_CONTEXT_READONLY','PROJECT_CONTEXT_REFERENCED','PROJECT_CONTEXT_INPUT'].includes(code);

// Reuse the public file service's versions, protection and operation receipts.
// A lost reply remains guarded until the original operation has been reconciled.
export function createContextFileActions({files,before,changed,id=()=>crypto.randomUUID()}){
  let state={dialog:null,busy:false,error:'',unknown:null,deleted:null,notice:''},flight=false,disposed=false;
  const listeners=new Set();
  const set=patch=>{state={...state,...patch};if(!disposed)for(const listener of listeners)listener();};
  const blocked=()=>state.busy||!!state.unknown;
  async function prepare(){if(disposed||flight||blocked())return false;flight=true;try{if(!await before()||disposed)return false;return true;}catch(error){set({error:error.message});return false;}finally{flight=false;}}
  async function begin(kind,path){
    if(!await prepare())return;
    flight=true;set({busy:true,error:'',notice:''});
    try{const source=await files.stat({scope:'workspace',path});if(disposed)return;
      if(!source.writable)throw Error(source.protection?.message??'此文件受保护，请使用对应专用入口。');
      set({dialog:{kind,source}});
    }catch(error){set({error:error.message});}finally{flight=false;set({busy:false});}
  }
  async function completed(request,result){
    // Clear the request before refreshing UI; a refresh failure never replays it.
    set({unknown:null,dialog:null,...(request.kind==='trash'?{deleted:result,notice:'已移入 KSF 回收站：'+request.source}:request.kind==='restore'?{deleted:null,notice:'已恢复原路径：'+result.path}:{notice:request.label+'完成：'+result.path})});
    try{await changed(request,result);}catch(error){set({error:'操作已完成，列表刷新失败：'+error.message});}
  }
  async function run(request){
    if(!await prepare())return false;
    flight=true;set({busy:true,error:'',notice:''});
    try{const result=await files[request.kind]({...request.input,operationId:request.id});await completed(request,result);return true;}
    catch(error){set({error:error.message,...(error.operationId===request.id&&!rejected(error.code)?{unknown:request}:{})});return false;}
    finally{flight=false;set({busy:false});}
  }
  async function commit(destination){
    const dialog=state.dialog;if(!dialog||blocked()||flight)return false;
    const {kind,source}=dialog;
    if(kind!=='delete'&&destination===source.path){set({error:kind==='rename'?'名称没有变化。':'文件已在此文件夹中。'});return false;}
    return run({id:id(),kind:kind==='delete'?'trash':'move',label:kind==='rename'?'重命名':'移动',source:source.path,input:{ref:source.ref,version:source.version,...(kind==='delete'?{}:{destination:{scope:'workspace',path:destination}})}});
  }
  async function reconcile(){
    const request=state.unknown;if(!request||state.busy||flight)return;
    flight=true;set({busy:true,error:''});
    try{const receipt=await files.operation(request.id);
      if(receipt.state==='committed')await completed(request,receipt.result);
      else if(['failed','rejected','not-found','notFound'].includes(receipt.state)||rejected(receipt.error?.code))set({unknown:null,error:receipt.error?.message??'原操作未完成，请核对文件后重新操作。'});
      else set({error:'原操作结果仍未确认，请保留此窗口并继续核对。'});
    }catch(error){set({error:'原操作尚无法核对：'+error.message});}finally{flight=false;set({busy:false});}
  }
  return {subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},getSnapshot:()=>state,blocked,begin,commit,reconcile,
    close(){if(blocked()||flight)return false;set({dialog:null,error:''});return true;},
    undo(){const entry=state.deleted;if(!entry)return;return run({id:id(),kind:'restore',label:'恢复',source:entry.ref.path,input:{trashId:entry.id}});},
    dismiss(){if(!blocked())set({notice:'',deleted:null,error:''});},
    dispose(){disposed=true;listeners.clear();},
  };
}
