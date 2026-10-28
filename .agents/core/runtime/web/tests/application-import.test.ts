import test from 'node:test';
import assert from 'node:assert/strict';
import {validateImportFile,uploadApplicationPackage} from '../src/apps/application-import.ts';
test('package picker rejects empty, wrong-extension and oversized files before upload',()=>{
  validateImportFile({name:'朋友分享.KSFAPP',size:32*1024*1024});
  for(const input of [{name:'bad.zip',size:1},{name:'empty.ksfapp',size:0},{name:'large.ksfapp',size:32*1024*1024+1}])assert.throws(()=>validateImportFile(input));
});
test('binary preview uses fresh session protection, preserves Unicode names and never invokes install',async()=>{
  const calls:{url:string;options?:RequestInit}[]=[],file=new File(['package'],'朋友 分享.ksfapp'),fetcher=(async(url,options)=>{
    calls.push({url:String(url),options});return new Response(JSON.stringify({ok:true,data:calls.length===1?{instanceId:'workspace',token:'test-token',nonce:'nonce'}:{importId:'review',action:'install'}}));
  }) as typeof fetch;
  const result=await uploadApplicationPackage(file,'workspace',undefined,fetcher);assert.equal(result.importId,'review');assert.equal(calls.length,2);
  assert.equal(new URL(calls[1].url,'http://local').searchParams.get('name'),file.name);assert.equal(calls[1].options?.body,file);assert.equal(calls[1].options?.method,'POST');assert.equal((calls[1].options?.headers as Record<string,string>)['X-KSF-Token'],'test-token');assert.ok(calls.every(call=>!call.url.endsWith('/install')));
});
test('different workspaces and upload failures never install or blindly replay',async()=>{
  let calls=0;const file=new File(['package'],'app.ksfapp'),fetcher=(async()=>{calls++;return new Response(JSON.stringify({ok:true,data:{instanceId:'other',token:'test-token'}}));}) as typeof fetch;
  await assert.rejects(uploadApplicationPackage(file,'workspace',undefined,fetcher),{code:'WORKBENCH_INSTANCE_CHANGED'});assert.equal(calls,1);
  calls=0;const failed=(async()=>{calls++;return new Response(JSON.stringify(calls===1?{ok:true,data:{instanceId:'workspace',token:'test-token'}}:{ok:false,error:{code:'APP_PACKAGE_INVALID',message:'损坏'}}),{status:calls===1?200:400});}) as typeof fetch;
  await assert.rejects(uploadApplicationPackage(file,'workspace',undefined,failed),{code:'APP_PACKAGE_INVALID'});assert.equal(calls,2);
});
