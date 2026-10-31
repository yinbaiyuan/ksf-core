// Shared SDK v1 business-flow contract. No evaluator, URLs, or executable schema.
export function workflowCheck(ok,message,code='WORKFLOW_INPUT_INVALID'){if(!ok)throw Object.assign(Error(message),{code});}
export const workflowId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
export const fieldKey=value=>workflowId(value)&&!['__proto__','constructor','prototype'].includes(value);
export function inputFields(value=[]){
  workflowCheck(Array.isArray(value)&&value.length<=32,'业务字段最多 32 项。');const seen=new Set();
  return value.map(f=>{workflowCheck(f&&fieldKey(f.key)&&!seen.has(f.key)&&typeof f.label==='string'&&f.label.length>0&&f.label.length<=120&&['text','textarea','number','boolean','select','materials'].includes(f.type),'业务字段无效或重复。');seen.add(f.key);
    const item={key:f.key,label:f.label,type:f.type,required:f.required===true};
    if(f.type==='select'){workflowCheck(Array.isArray(f.options)&&f.options.length>0&&f.options.length<=40&&new Set(f.options).size===f.options.length&&f.options.every(o=>typeof o==='string'&&o.length>0&&o.length<=200),'选项无效。');item.options=[...f.options];}return item;});
}
export function materialRefs(value=[]){workflowCheck(Array.isArray(value)&&value.length<=64,'材料列表无效。');return value.map(m=>{workflowCheck(m&&/^[a-f0-9]{64}$/.test(m.digest)&&typeof m.name==='string'&&m.name.length>0&&m.name.length<=256&&!/[\\/\x00-\x1f]/.test(m.name)&&Number.isSafeInteger(m.size)&&m.size>=0&&m.size<=128*1024*1024,'材料引用无效。');return {digest:m.digest,name:m.name,size:m.size,mediaType:typeof m.mediaType==='string'?m.mediaType:'application/octet-stream'};});}
export function fieldValues(fields,value={}){
  workflowCheck(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>fields.some(f=>f.key===k)),'输入包含未声明字段。');const result={};
  for(const f of fields){const v=value[f.key];if(v===undefined||v===null||v===''){workflowCheck(!f.required,'请填写：'+f.label);continue;}
    if(['text','textarea'].includes(f.type))workflowCheck(typeof v==='string'&&v.length<=(f.type==='text'?2000:65536),'文本字段无效：'+f.label);
    if(f.type==='number')workflowCheck(typeof v==='number'&&Number.isFinite(v),'数字字段无效：'+f.label);
    if(f.type==='boolean')workflowCheck(typeof v==='boolean','开关字段无效：'+f.label);
    if(f.type==='select')workflowCheck(f.options.includes(v),'选项无效：'+f.label);
    result[f.key]=f.type==='materials'?materialRefs(v):v;if(f.required&&f.type==='materials')workflowCheck(result[f.key].length>0,'请添加：'+f.label);
  }workflowCheck(JSON.stringify(result).length<=128*1024,'表单内容过大。');return result;
}
export function workflowDescriptor(value){
  workflowCheck(value&&workflowId(value.id)&&Number.isSafeInteger(value.revision)&&value.revision>0&&typeof value.name==='string'&&value.name.length>0&&value.name.length<=120,'流程描述无效。');
  const outputs=value.outputs??[{key:'summary',label:'成果说明',type:'text'},{key:'materials',label:'成果文件',type:'materials'}];
  workflowCheck(Array.isArray(outputs)&&outputs.length<=32&&new Set(outputs.map(f=>f.key)).size===outputs.length&&outputs.every(f=>fieldKey(f.key)&&['text','materials'].includes(f.type)),'流程输出声明无效。');
  return {id:value.id,revision:value.revision,name:value.name,description:typeof value.description==='string'?value.description.slice(0,4000):'',inputs:inputFields(value.inputs),outputs:outputs.map(f=>({key:f.key,label:String(f.label??f.key).slice(0,120),type:f.type}))};
}
export function workflowBinding(value){
  workflowCheck(value&&/^com\.[a-z0-9.-]+$/.test(value.appId)&&/^[a-f0-9]{64}$/.test(value.packageDigest)&&workflowId(value.workflowId)&&Number.isSafeInteger(value.revision)&&value.revision>0,'请选择具体应用及工作流版本。');
  const fixed=value.fixedInputs??{};workflowCheck(fixed&&typeof fixed==='object'&&!Array.isArray(fixed)&&Object.keys(fixed).every(fieldKey)&&JSON.stringify(fixed).length<=65536,'本机固定输入无效。');
  const output=value.outputMapping??{summary:'summary',materials:'materials'};workflowCheck(fieldKey(output.summary)&&(!output.materials||fieldKey(output.materials)),'请选择流程成果字段。');
  return {appId:value.appId,packageDigest:value.packageDigest,workflowId:value.workflowId,revision:value.revision,fixedInputs:structuredClone(fixed),outputMapping:{summary:output.summary,...(output.materials?{materials:output.materials}:{})}};
}
