export function activate(context){
  const methods=new Set(['tree','read','search','save','create','move','unlock','upload']);
  return {call(method,params=[]){if(!methods.has(method))throw Object.assign(new Error('未知文档方法。'),{code:'APP_CALL_INVALID'});return context.services.call('workspace',method,params);}};
}
