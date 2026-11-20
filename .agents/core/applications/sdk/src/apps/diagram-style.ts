/** Mermaid previews are static and cannot fetch resources through CSS. */
function safeValue(name:string,value:string){
 if(name.startsWith('--')||/^(?:animation|transition)(?:-|$)/i.test(name)||/\\|(?:var|image-set|image|paint|src|expression)\s*\(/i.test(value))return false;
 for(const match of value.matchAll(/url\s*\(([^)]*)\)/gi))if(!/^['"]?#[\w-]+['"]?$/.test(match[1].trim()))return false;
 return true;
}
export function diagramDeclarations(css:string):string{
 const style=document.createElement('span').style;style.cssText=css;
 for(const name of [...style])if(!safeValue(name,style.getPropertyValue(name)))style.removeProperty(name);
 return style.cssText;
}
export function diagramRules(css:string):string{
 const sheet=new CSSStyleSheet();sheet.replaceSync(css);
 const clean=(rules:CSSRuleList):string=>[...rules].map(rule=>{
  if(rule.type===CSSRule.STYLE_RULE){const r=rule as CSSStyleRule;return `${r.selectorText}{${diagramDeclarations(r.style.cssText)}}`;}
  if('cssRules'in rule&&/^@(media|supports|layer|container)\b/.test(rule.cssText))return rule.cssText.slice(0,rule.cssText.indexOf('{'))+'{'+clean((rule as CSSGroupingRule).cssRules)+'}';
  return '';
 }).join('\n');
 return clean(sheet.cssRules);
}
