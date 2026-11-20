export const WORKBENCH_HOSTNAME='ksf.localhost';
export function workbenchURL(port){return `http://${WORKBENCH_HOSTNAME}${port===80?'':`:${port}`}/`;}
export function workbenchHosts(port,legacyName='ksf.ai'){
  const names=['127.0.0.1','localhost',WORKBENCH_HOSTNAME,legacyName];
  return [...names.map(name=>`${name}:${port}`),...(port===80?names:[])];
}
