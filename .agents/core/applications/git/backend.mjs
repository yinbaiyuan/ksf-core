export async function activate(context) {
  const methods=new Set(['list','owner','status','diff','history','commit','tree','refs','settings','conflict','stashDetail','start','operation','invalidate']);
  return {call(method,params=[]) {
    if(!methods.has(method))throw Object.assign(new Error('未知 Git 方法。'),{code:'APP_CALL_INVALID'});
    return context.services.call('git',method,params);
  }};
}
