// A window's project reader survives object navigation. Only file metadata and
// revisions are retained here; draft contents and save receipts keep their owner.
export function createContextChangesReader({sdk,project,reviewSession,getRecord,onRevision}){
  const cache=new Map(),pending=new Map(),requested=new Map();
  let batchSupported=true,alive=true,lastProbe=0,sequence=0;
  function results(scopes,force){
    return scopes.map(scope=>{
      const value=cache.get(scope.objectPath);
      return {scope,result:{...value,...(!force&&value?.revision===scope.revision?{entries:undefined}:{})}};
    });
  }
  function notify(base,revision,error=''){
    if(alive)onRevision?.({baseline:base?.etag,...revision,error});
  }
  return {
    peek(scopes){return scopes.every(scope=>cache.has(scope.objectPath))?results(scopes,true):null;},
    async afterChange(scopes){
      const key=scopes.map(scope=>scope.objectPath).sort().join('\n');
      // A response started before the mutation cannot confirm its final path.
      if(pending.has(key))await pending.get(key).catch(()=>{});
      return this.read(scopes,true);
    },
    async read(scopes,force=false){
      const key=scopes.map(scope=>scope.objectPath).sort().join('\n');
      const base=getRecord?.();
      if(!pending.has(key)){
      const request=++sequence;
      for(const scope of scopes)requested.set(scope.objectPath,request);
      pending.set(key,(async()=>{
        const objects=scopes.map(scope=>({objectPath:scope.objectPath,revision:force?undefined:cache.get(scope.objectPath)?.revision}));
        let values,revision;
        if(batchSupported){
          const value=await sdk.call('context-files',{...project,action:'changes',objectPath:objects[0].objectPath,objects,reviewSession,includeDeleted:true});
          if(Array.isArray(value.scopes)){values=value.scopes;revision=value.governanceRevision;}
          else{batchSupported=false;values=[value,...await Promise.all(objects.slice(1).map(object=>sdk.call('context-files',{...project,...object,action:'changes',reviewSession,includeDeleted:true})))];}
        }else values=await Promise.all(objects.map(object=>sdk.call('context-files',{...project,...object,action:'changes',reviewSession,includeDeleted:true})));
        for(let i=0;i<scopes.length;i++){
          if(!alive||requested.get(scopes[i].objectPath)!==request)continue;
          const value=values[i];
          const prior=cache.get(scopes[i].objectPath);
          cache.set(scopes[i].objectPath,{...prior,...value,...(value.entries===undefined&&prior?.entries?{entries:prior.entries}:{})});
        }
        if(!revision&&!batchSupported&&Date.now()-lastProbe>=15000){
          lastProbe=Date.now();
          const latest=await sdk.call('governance.read',project);
          revision={etag:latest.etag,projectId:latest.project?.metadata.id};
        }
        if(revision&&request===sequence)notify(base,revision);
      })().catch(error=>{if(request===sequence)notify(base,undefined,error.message);throw error;}).finally(()=>pending.delete(key)));
      }
      await pending.get(key);
      return results(scopes,force);
    },
    dispose(){alive=false;cache.clear();},
  };
}
