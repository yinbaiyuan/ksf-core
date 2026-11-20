export function normalizePoint(point?:{x:number;y:number}):{x:number;y:number};
export function straightenScale(angle:number,aspect?:number):number;
export function normalizeTrim(start:number,end:number,duration:number,minLength?:number):[number,number];
export function cropWindow(point:{x:number;y:number},sourceAspect:number,targetAspect:number):{x:number;y:number;width:number;height:number};
