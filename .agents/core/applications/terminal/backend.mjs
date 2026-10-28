export async function activate(context) {
  const methods=new Set(['create','list','read','write','resize','close']);
  return {call(method,input={}) {
    if(!methods.has(method))throw new Error('未知终端操作。');
    return context.services.call('terminal',method,[input]);
  }};
}
