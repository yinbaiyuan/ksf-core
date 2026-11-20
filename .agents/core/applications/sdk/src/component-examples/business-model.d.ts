export function amountToCents(text:string):number|null;
export function money(cents:number,currency?:string):string;
export function nearestFreeSlot(request:number,duration:number,occupied:readonly (readonly [number,number])[],min?:number,max?:number,step?:number):number|null;
export function timeLabel(minutes:number):string;
export function testCardValid(digits:string):boolean;
