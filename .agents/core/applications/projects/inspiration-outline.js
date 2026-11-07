const START='<!-- ksf-inspiration-outline:v1 -->';
const END='<!-- /ksf-inspiration-outline -->';
let sequence=0;
export const outlineId=()=>`outline_${++sequence}`;

export function parseOutline(text,makeId=outlineId){
  const eol=text.includes('\r\n')?'\r\n':'\n';
  const starts=[...text.matchAll(/^<!-- ksf-inspiration-outline:v1 -->(?=\r?$)/gm)];
  const ends=[...text.matchAll(/^<!-- \/ksf-inspiration-outline -->(?=\r?$)/gm)];
  if(!starts.length&&!ends.length){
    if(/^<!-- ksf-inspiration-outline:/m.test(text))throw Error('大纲版本暂不支持，请使用原文模式；现有文字已保留。');
    return {prefix:text,suffix:'',eol,managed:false,rows:[]};
  }
  if(starts.length!==1||ends.length!==1||ends[0].index<starts[0].index)throw Error('大纲标记不完整，请在原文模式核对；现有文字已保留。');
  const start=starts[0],end=ends[0];
  const body=text.slice(start.index+start[0].length,end.index).replace(/^\r?\n/,'').replace(/\r?\n$/,'');
  const rows=[];
  for(const line of body?body.split(/\r?\n/):[]){
    const match=/^( *)- \[([ xX])\](?: (.*))?$/.exec(line);
    if(!match||match[1].length%2)throw Error('大纲中有无法识别的行，请在原文模式核对；现有文字已保留。');
    const depth=match[1].length/2;
    if(depth>(rows.at(-1)?.depth??-1)+1)throw Error('大纲层级缺少上级，请在原文模式核对。');
    rows.push({id:makeId(),depth,done:match[2]!==' ',text:match[3]??''});
  }
  return {prefix:text.slice(0,start.index),suffix:text.slice(end.index+end[0].length),eol,managed:true,rows};
}

export function serializeOutline(model){
  const {eol,rows}=model;
  for(const [i,row] of rows.entries()){
    if(!Number.isInteger(row.depth)||row.depth<0||row.depth>(rows[i-1]?.depth??-1)+1||/[\r\n]/.test(row.text))throw Error('大纲行或层级无效，草稿已保留。');
  }
  const prefix=model.managed?model.prefix:model.prefix+(model.prefix&&!model.prefix.endsWith(eol+eol)?(model.prefix.endsWith(eol)?eol:eol+eol):'');
  return prefix+START+eol+rows.map(row=>'  '.repeat(row.depth)+`- [${row.done?'x':' '}] ${row.text}`).join(eol)+eol+END+(model.managed?model.suffix:eol);
}

export function subtreeEnd(rows,index){
  let end=index+1;
  while(end<rows.length&&rows[end].depth>rows[index].depth)end++;
  return end;
}

export function visibleOutlineRows(rows,collapsed=new Set()){
  const result=[];let hiddenDepth=null;
  for(let i=0;i<rows.length;i++){
    const row=rows[i];
    if(hiddenDepth!==null&&row.depth>hiddenDepth)continue;
    hiddenDepth=null;
    result.push({...row,hasChildren:(rows[i+1]?.depth??-1)>row.depth});
    if(collapsed.has(row.id))hiddenDepth=row.depth;
  }
  return result;
}

export function changeOutline(original,action,makeId=outlineId){
  const rows=original.map(row=>({...row}));
  const index=rows.findIndex(row=>row.id===action.id),row=rows[index];
  if(action.kind==='append'){
    const next={id:makeId(),text:'',done:false,depth:0};rows.push(next);return {rows,focus:next.id};
  }
  if(!row)return {rows,focus:null};
  const end=subtreeEnd(rows,index);
  if(action.kind==='child'||action.kind==='sibling'){
    const next={id:makeId(),text:'',done:false,depth:row.depth+(action.kind==='child'?1:0)};
    rows.splice(end,0,next);return {rows,focus:next.id,expand:row.id};
  }
  if(action.kind==='split'||action.kind==='paste'){
    const start=action.start??row.text.length,stop=action.end??start;
    const lines=(action.kind==='paste'?action.text:'\n').replace(/\r\n?/g,'\n').split('\n');
    const suffix=row.text.slice(stop);row.text=row.text.slice(0,start)+lines[0];
    const inserted=lines.slice(1).map(text=>({id:makeId(),text,done:false,depth:row.depth}));
    if(inserted.length){inserted.at(-1).text+=suffix;rows.splice(end,0,...inserted);return {rows,focus:inserted.at(-1).id,caret:lines.at(-1).length};}
    row.text+=suffix;return {rows,focus:row.id,caret:start+lines[0].length};
  }
  if(action.kind==='indent'){
    let previous=index-1;while(previous>=0&&rows[previous].depth>row.depth)previous--;
    if(previous<0||rows[previous].depth!==row.depth)return {rows,focus:row.id};
    for(let i=index;i<end;i++)rows[i].depth++;
    return {rows,focus:row.id,expand:rows[previous].id};
  }
  if(action.kind==='outdent'&&row.depth>0){
    let parent=index-1;while(parent>=0&&rows[parent].depth>=row.depth)parent--;
    const parentEnd=subtreeEnd(rows,parent),branch=rows.splice(index,end-index);
    branch.forEach(item=>item.depth--);rows.splice(parentEnd-branch.length,0,...branch);
    return {rows,focus:row.id};
  }
  if(action.kind==='remove'){
    for(let i=index+1;i<end;i++)rows[i].depth--;
    rows.splice(index,1);return {rows,focus:rows[index]?.id??rows[index-1]?.id??null};
  }
  if(action.kind==='toggle')row.done=!row.done;
  return {rows,focus:row.id};
}
