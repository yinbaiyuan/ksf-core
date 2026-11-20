/** Diagrams are static text/shape previews, with no HTML attributes or media. */
export function validateDiagramInput(code:string):void{
 const fail=(code:string,message:string):never=>{throw Object.assign(Error(message),{code});};
 if(code.length>50000)fail('UI_DIAGRAM_TOO_LARGE','图表超过 50,000 字符，请缩小内容。');
 let decoded=code;
 for(let i=0;i<8;i++){
  const next=decoded.replace(/&#(?:x([\da-f]+)|(\d+));?/gi,(all,hex,decimal)=>{const n=parseInt(hex??decimal,hex?16:10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):all;}).replace(/&(amp|lt|gt|quot|apos|tab|newline);?/gi,(_,name:string)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",tab:'\t',newline:'\n'}[name.toLowerCase()]!));
  if(next===decoded)break;decoded=next;
  if(i===7)fail('UI_DIAGRAM_UNSAFE_MARKUP','图表标签包含过度转义的内容，请改用纯文本。');
 }
 for(const tag of decoded.matchAll(/<\/?[a-zA-Z][^>]*>/g))if(!/^<\/?(?:b|i|em|strong|code)>$|^<br\s*\/?>$/i.test(tag[0]))fail('UI_DIAGRAM_UNSAFE_MARKUP','图表标签支持纯文本和无属性的基础格式；HTML属性、脚本和嵌入内容请改用文字说明。');
 const css=decoded.replace(/\\\r?\n/g,'').replace(/\\([\da-f]{1,6})\s?|\\(.)/gi,(_,hex,escaped)=>hex?String.fromCodePoint(Math.min(0x10ffff,parseInt(hex,16))):escaped);
 if(/(?:url|image(?:-set)?|src|paint|expression)\s*\(/i.test(css)||/!\[[^\]]*\]\(/.test(decoded)||/@\{[^}]*\b(?:img|icon)\s*:/i.test(decoded))fail('UI_DIAGRAM_REMOTE_RESOURCE','图表预览不加载图片、外部CSS资源或动态绘制内容，请使用文字和基础形状。');
}
