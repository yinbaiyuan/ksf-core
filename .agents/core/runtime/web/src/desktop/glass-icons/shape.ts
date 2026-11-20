/** Shared physical radius: desktop cards use exactly the desktop icon's pixel radius. */
export function iconGlassRadius(size:number,surface:'desktop'|'dock'='desktop'){
 return Math.round(size*(surface==='dock'?.42:.18)/2);
}
