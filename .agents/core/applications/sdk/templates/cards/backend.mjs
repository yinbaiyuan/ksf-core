import {createJSONStore} from '@ksf/sdk/storage';
export async function activate(context){
 const state=createJSONStore(context,{initial:{count:0},validate:data=>Number.isInteger(data.count)});
 return {async call(method){if(method==='read')return (await state.read()).data;if(method==='increment')return (await state.update(data=>({...data,count:data.count+1}))).data;throw Object.assign(Error('未知方法'),{code:'APP_METHOD_UNKNOWN'});}};
}

export async function prepareData(context){await createJSONStore(context,{initial:{count:0}}).migrate();}
