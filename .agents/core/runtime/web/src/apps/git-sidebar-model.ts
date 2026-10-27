export function sidebarMax(total:number,reserve:number,min:number,max:number) {
  return Math.max(min,Math.min(max,total-reserve));
}
export function sidebarWidth(value:unknown,initial:number,min:number,max:number) {
  const width=typeof value==='number'&&Number.isFinite(value)?value:initial;
  return Math.max(min,Math.min(max,width));
}
