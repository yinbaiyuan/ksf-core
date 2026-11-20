import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Build-time adaptations of the locked MIT Mermaid 12.2.0 / ISC
// d3-selection 3.0.0 sources. No installed files or DOM prototypes change.
// Keep upstream sanitization, and carry its sanitized DOM to the consumer
// instead of parsing serialized style attributes under strict style-src.
const sources = {
  'mermaid/dist/mermaid.core.mjs':'4d085c790146a42c65d51ea21170427b24bc706de970df570331321996cbdbaf',
  'mermaid/dist/chunks/mermaid.core/chunk-4EMNKR2T.mjs':'becade4ff2f68bfbb0d9d61f8a92295ed57156108e770f4204a13c56db516eb0',
  'mermaid/dist/chunks/mermaid.core/chunk-HAGFOTED.mjs':'c53cf704d2fab2bcb9397c85d2c50546354ea6573a581dc62235a2e321ca9d79',
  'd3-selection/src/selection/attr.js':'b46ff374f921ddb3a69172cc0b18327a659355e7203a524ec54e86c872e77bec',
};
function replaceOnce(code, before, after) {
  if(code.split(before).length!==2)throw Error('Mermaid CSP adapter anchor changed; review the locked dependency before building.');
  return code.replace(before,after);
}
export function adaptMermaidCSP(code,id) {
  const path=id.split('?')[0].replaceAll('\\','/');
  const source=Object.keys(sources).find(name=>path.endsWith('/node_modules/'+name));
  if(!source)return null;
  if(createHash('sha256').update(code).digest('hex')!==sources[source])throw Error('Mermaid CSP adapter source changed: '+source);
  const helpers=`import {diagramDeclarations as ksfDeclarations,diagramRules as ksfRules} from ${JSON.stringify(fileURLToPath(new URL('../src/apps/diagram-style.ts',import.meta.url)))};\n`;
  if(source.endsWith('/attr.js')){
    code=replaceOnce(code,'this.setAttribute(name, value);','if (name === "style" && this.style) this.style.cssText = ksfDeclarations(String(value));\n    else this.setAttribute(name, value);');
    return helpers+replaceOnce(code,'else this.setAttribute(name, v);','else if (name === "style" && this.style) this.style.cssText = ksfDeclarations(String(v));\n    else this.setAttribute(name, v);');
  }
  if(source.endsWith('chunk-4EMNKR2T.mjs'))return helpers+replaceOnce(code,'pathEl.setAttribute("style", cleaned);','pathEl.style.cssText = ksfDeclarations(cleaned);');
  if(source.endsWith('chunk-HAGFOTED.mjs'))return helpers+replaceOnce(code,'child.setAttribute("style", style);','child.style.cssText = ksfDeclarations(style);');
  code=replaceOnce(code,'style1.innerHTML = rules;','const ksfNonce = svgContainingElement?.getAttribute("data-ksf-style-nonce");\n  if (!ksfNonce) throw Error("Mermaid requires the host style nonce.");\n  style1.setAttribute("nonce", ksfNonce);\n  const ksfStyleRules = ksfRules(rules);\n  style1.textContent = ksfStyleRules;');
  code=replaceOnce(code,'const serializeSvg =','let ksfSanitizedSvg = null;\n  const serializeSvg =');
  code=replaceOnce(code,'code2 = DOMPurify.sanitize(code2, {','ksfSanitizedSvg = svgNode.node().cloneNode(true);\n      DOMPurify.sanitize(ksfSanitizedSvg, {\n        IN_PLACE: true,');
  code=replaceOnce(code,'HTML_INTEGRATION_POINTS: { foreignobject: true }\n      });','HTML_INTEGRATION_POINTS: { foreignobject: true }\n      });\n      code2 = ksfSanitizedSvg.outerHTML;');
  return helpers+replaceOnce(code,'svg: svgCode,','svg: svgCode,\n    svgElement: ksfSanitizedSvg,\n    styleRules: ksfStyleRules,');
}
export function mermaidCSPPlugin(){return {name:'ksf-mermaid-strict-csp',enforce:'pre',transform(code,id){const result=adaptMermaidCSP(code,id);return result===null?null:{code:result,map:null};}};}
