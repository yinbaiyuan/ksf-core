/** Navigation boundary only; file permissions and concurrency are still checked by FileClient. */
export const withinPickerRoot=(path:string,root:string)=>!root||path===root||path.startsWith(root+'/');
function relativePath(path:string){if(typeof path!=='string'||path.startsWith('/')||/[\\\x00-\x1f]/.test(path)||path.split('/').some(part=>part==='.'||part==='..'||!part&&path!==''))throw Error('请选择有效的相对目录。');return path;}
export function pickerLocation(options:{rootPath?:string;initialPath?:string}){
 const root=relativePath(options.rootPath??''),initial=relativePath(options.initialPath??root);
 if(!withinPickerRoot(initial,root))throw Error('初始目录必须位于当前文件范围。');return {root,initial};
}
