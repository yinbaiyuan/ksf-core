export function createCLI(context){return {execute(command,input){return context.invoke(command,{...input.params,operationId:input.operationId});}};}
