// Edit only an explicitly chosen summary section. All other source text stays byte-for-byte.
export const detailSectionNames=['目标','当前结果','未决与缺口'];
function headings(body){
 const result=[];let offset=0,fence=null;
 for(const line of body.match(/[^\n]*\n|[^\n]+$/g)??[]){
  const marker=line.match(/^ {0,3}(`{3,}|~{3,})/);
  if(marker){if(!fence)fence={char:marker[1][0],length:marker[1].length};else if(marker[1][0]===fence.char&&marker[1].length>=fence.length&&/^ {0,3}(`+|~+)\s*$/.test(line))fence=null;}
  else if(!fence){const h=line.match(/^ {0,3}(#{1,2})\s+(.+?)\s*#*\s*$/);if(h)result.push({start:offset,content:offset+line.length,level:h[1].length,name:h[2]});}
  offset+=line.length;
 }
 return result.map((h,i)=>({...h,end:result[i+1]?.start??body.length}));
}
export function detailContentFields(body=''){
 const rows=headings(body),ambiguous=detailSectionNames.some(name=>rows.filter(h=>h.level===2&&h.name===name).length>1);
 return {ambiguous,values:Object.fromEntries(detailSectionNames.map(name=>{const h=rows.find(h=>h.level===2&&h.name===name);return [name,h?body.slice(h.content,h.end).trim():''];}))};
}
export function updateDetailSection(body,name,value){
 if(!detailSectionNames.includes(name))throw Error('未知的摘要章节');
 const rows=headings(body).filter(h=>h.level===2&&h.name===name);if(rows.length>1)throw Error('存在同名章节，请在原文中明确修改。');
 const newline=body.includes('\r\n')?'\r\n':'\n',text=value.replace(/\r?\n/g,newline);
 if(!rows.length)return body+(body.endsWith(newline+newline)?'':body.endsWith(newline)?newline:newline+newline)+'## '+name+newline+newline+text+newline;
 const h=rows[0],original=body.slice(h.content,h.end),leading=original.match(/^\s*/)?.[0]??newline,trailing=original.match(/\s*$/)?.[0]??newline;
 return body.slice(0,h.content)+leading+text+trailing+body.slice(h.end);
}
