export interface BackgroundApplication {id:string;name:string;enabled:boolean;hasWindow:boolean;state:string;lifecycle:string;runtimes:{id:string}[]}
export interface BackgroundSnapshot {applications:BackgroundApplication[]}
export function runningBackgroundApplications(snapshot:BackgroundSnapshot|null){
 return snapshot?.applications.filter(app=>app.enabled&&app.state==='running'&&app.runtimes.length>0)??[];
}
export function backgroundIconSlots(width:number){return Math.max(1,Math.floor(Math.min(240,Math.max(28,width-380))/28));}
export function windowApplicationIds(windows:{appId:string}[]){return [...new Set(windows.map(window=>window.appId))];}
