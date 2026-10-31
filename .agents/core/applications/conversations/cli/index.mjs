export function createCLI(context) {
  const methods = { overview:'review.overview',profiles:'review.profiles',configure:'review.configure',generate:'review.generate',report:'review.read',confirm:'review.confirm',resume:'review.resume',retry:'review.retry',suggestions:'suggestions.list',suggestion:'suggestions.update',chats:'chats.list',restore:'chats.restore' };
  return {execute(commandId,input){
    if(!Object.hasOwn(methods,commandId))throw Object.assign(Error('未知对话命令。'),{code:'APP_CALL_INVALID'});
    const {expectedPackageDigest,operationId,...params}=input??{};
    return context.invoke(methods[commandId],{...params,...(operationId?{operationId}:{})});
  }};
}
