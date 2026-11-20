import {readFile,writeFile,mkdir,readdir,unlink} from 'node:fs/promises';
import {createRequire} from 'node:module';import {resolve} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const sdk=fileURLToPath(new URL('..',import.meta.url)),web=resolve(sdk,'../../runtime/web'),req=createRequire(resolve(web,'package.json'));
const {compile}=await import(pathToFileURL(req.resolve('@tailwindcss/node'))),{Scanner}=await import(pathToFileURL(req.resolve('@tailwindcss/oxide'))),postcss=(await import(pathToFileURL(createRequire(resolve(sdk,'package.json')).resolve('postcss')))).default;
const base=`/* Fixed-source Kokonut adaptations: shared reset scoped to this module only. */
.ksf-kokonut{color:var(--ksf-color-foreground);font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:28px;isolation:isolate}
.ksf-kokonut *,.ksf-kokonut *::before,.ksf-kokonut *::after{box-sizing:border-box;border-width:0;border-style:solid;border-color:var(--ksf-color-border)}
.ksf-kokonut button,.ksf-kokonut input,.ksf-kokonut textarea,.ksf-kokonut select{font:inherit;color:inherit;background:transparent;margin:0;padding:0;letter-spacing:inherit}
.ksf-kokonut blockquote,.ksf-kokonut dl,.ksf-kokonut dd,.ksf-kokonut figure,.ksf-kokonut pre{margin:0}
.ksf-kokonut fieldset{margin:0;padding:0;min-width:0}.ksf-kokonut legend{padding:0}
.ksf-kokonut button{cursor:pointer}.ksf-kokonut button:disabled{cursor:default}
.ksf-kokonut p,.ksf-kokonut h1,.ksf-kokonut h2,.ksf-kokonut h3,.ksf-kokonut h4,.ksf-kokonut h5,.ksf-kokonut h6{margin:0;font-size:inherit;font-weight:inherit}
.ksf-kokonut svg{vertical-align:middle;display:block}.ksf-kokonut img{display:block;max-width:100%;height:auto}.ksf-kokonut ol,.ksf-kokonut ul{margin:0;padding:0;list-style:none}.ksf-kokonut a{color:inherit;text-decoration:none}
.ksf-kokonut.ksf-kokonut.ksf-kokonut:where(:not(.ksf-kokonut--morphic-navbar,.ksf-kokonut--tear-button)) button.bg-zinc-900:not(:disabled),.ksf-kokonut.ksf-kokonut.ksf-kokonut:where(:not(.ksf-kokonut--morphic-navbar,.ksf-kokonut--tear-button)) a.bg-zinc-900:not([aria-disabled="true"]){background-color:var(--ksf-color-primary);color:var(--ksf-color-on-primary)}.ksf-kokonut.ksf-kokonut.ksf-kokonut:where(:not(.ksf-kokonut--morphic-navbar,.ksf-kokonut--tear-button)) button.bg-zinc-900:hover,.ksf-kokonut.ksf-kokonut.ksf-kokonut:where(:not(.ksf-kokonut--morphic-navbar,.ksf-kokonut--tear-button)) a.bg-zinc-900:hover{background-color:color-mix(in srgb,var(--ksf-color-primary) 90%,var(--ksf-color-foreground))}
.ksf-kokonut[data-motion-active=false] *{animation-play-state:paused!important}@media(prefers-reduced-motion:reduce){.ksf-kokonut *{animation-duration:.001ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important}}
`;
await writeFile(resolve(sdk,'src/fidelity/kokonut-base.css'),base);await mkdir(resolve(sdk,'src/fidelity/styles'),{recursive:true});
const themeColor=(r,g,b,a=1)=>{if(Math.max(r,g,b)-Math.min(r,g,b)<18)return null;const light=(r*.2126+g*.7152+b*.0722)/255;const primary=light<.16?`color-mix(in srgb,var(--ksf-color-primary) ${Math.round(light/.16*25)}%,var(--ksf-color-surface))`:light>.78?`color-mix(in srgb,var(--ksf-color-primary) ${Math.round((1-light)/.22*65)}%,var(--ksf-color-surface-raised))`:'var(--ksf-color-primary)';return a<1?`color-mix(in srgb,${primary} ${Math.round(a*100)}%,transparent)`:primary;};
const animationCss=resolve(sdk,'node_modules/tw-animate-css/dist/tw-animate.css'); // pinned 1.4.0 in the SDK lock, matching the fixed upstream lock.
let bytes=0,count=0;
for(const name of (await readdir(resolve(sdk,'src/fidelity/kokonut'))).filter(n=>n.endsWith('.tsx'))){
 const file=resolve(sdk,'src/fidelity/kokonut',name),scanner=new Scanner({}),candidates=scanner.scanFiles([{content:await readFile(file,'utf8'),extension:'tsx'},{content:name==='glitch-text.tsx'?'font-semibold @lg:text-7xl text-5xl tracking-tight':'',extension:'tsx'},{content:await readFile(resolve(sdk,'src/fidelity/primitives.tsx'),'utf8')+await readFile(resolve(sdk,'src/fidelity/menu.tsx'),'utf8')+await readFile(resolve(sdk,'src/fidelity/reference-card.tsx'),'utf8'),extension:'tsx'}]);
 const compiled=await compile('@import "'+animationCss+'";\n@import "tailwindcss/theme.css" layer(theme);\n@import "tailwindcss/utilities.css" layer(utilities);\n@custom-variant dark (&:where([data-ksf-theme="dark"], [data-ksf-theme="dark"] *));',{base:web,onDependency:()=>{}});
 const moduleScope='.ksf-kokonut.ksf-kokonut--'+name.replace('.tsx','');
 const ast=postcss.parse(compiled.build(candidates));ast.walkAtRules('layer',rule=>{if(rule.nodes)rule.replaceWith(...rule.nodes);else rule.remove();});
 const isKeyframe=r=>{for(let p=r.parent;p;p=p.parent)if(p.type==='atrule'&&p.name.includes('keyframes'))return true;return false;};
 ast.walkRules(r=>{if(isKeyframe(r)||r.parent?.type==='rule')return;const selector=r.selector;if(selector===':root, :host'||selector===':root,\n:host'||selector===':root'||selector===':host'){r.selector=moduleScope;return;}r.selector=postcss.list.comma(selector).map(part=>{const dark=part.includes(':where([data-ksf-theme="dark"]');const cleaned=part.replace(':where([data-ksf-theme="dark"], [data-ksf-theme="dark"] *)','');return moduleScope+(dark?'[data-ksf-reference-theme="dark"]':'')+' '+cleaned.trim();}).join(',');});
 const namedAnimations=new Map();ast.walkDecls(d=>{if(d.prop.startsWith('--animate-'))namedAnimations.set(d.prop,d.value);});
 // Emit literal animation names so the KSF app builder can namespace both references and keyframes.
 ast.walkDecls(d=>{if(d.prop==='animation'||d.prop==='animation-name')d.value=d.value.replace(/var\((--animate-[\w-]+)\)/g,(original,key)=>namedAnimations.get(key)??original);});
 // Container and viewport breakpoints must use the same fixed 16px reference as dimensions.
 ast.walkAtRules(rule=>{if(['container','media'].includes(rule.name))rule.params=rule.params.replace(/(-?(?:\d*\.)?\d+)rem\b/g,(_,n)=>`${Number(n)*16}px`);});
 ast.walkDecls(d=>{
  d.value=d.value.replace(/(-?(?:\d*\.)?\d+)rem\b/g,(_,n)=>`${Number(n)*16}px`); // Fixed reference viewport uses a 16px root; host root size must not shrink components.

  d.value=d.value.replace(/#([\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})\b/gi,(raw,hex)=>{if(hex.length<5)hex=[...hex].map(c=>c+c).join('');return themeColor(parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16),hex.length===8?parseInt(hex.slice(6),16)/255:1)??raw;});
  d.value=d.value.replace(/rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/gi,(raw,r,g,b,a)=>themeColor(+r,+g,+b,a===undefined?1:+a)??raw);
  const m=d.prop.match(/^--color-(blue|sky|cyan|indigo|violet|purple|pink|fuchsia|rose|red|orange|amber|yellow|lime|green|emerald|teal)-(\d+)$/);
  if(m){const kind=['red','rose'].includes(m[1])?'danger':['green','emerald','lime'].includes(m[1])?'success':['orange','amber','yellow'].includes(m[1])?'warning':'primary';d.value=Number(m[2])<=100?`var(--ksf-color-${kind}-surface)`:`var(--ksf-color-${kind})`;}
  if(/^(color|background-color|border-color|outline-color|fill|stroke)$/.test(d.prop)){
   d.value=d.value.replace(/var\(--color-(zinc|neutral|slate|gray)-(\d+)\)/g,(_,family,n)=>{n=Number(n);let dark=false;for(let p=d.parent;p;p=p.parent)if(p.selector?.includes('dark\\:'))dark=true;
    if(d.prop.includes('border')||d.prop==='outline-color')return `var(--ksf-color-${(dark?n<700:n>=400)?'border-strong':'border'})`;
    const shades={50:2,100:4,200:10,300:17,400:36,500:56,600:68,700:75,800:84,900:90,950:96};let weight=shades[n]??60;if(dark)weight=100-weight;
    if(weight===100)return 'var(--ksf-color-foreground)';if(weight===0)return 'var(--ksf-color-background)';return `color-mix(in srgb,var(--ksf-color-foreground) ${weight}%,var(--ksf-color-background))`;
   });
   if(d.prop==='background-color')d.value=d.value.replace(/var\(--color-white\)/g,'light-dark(var(--ksf-color-surface-raised),var(--ksf-color-foreground))').replace(/var\(--color-black\)/g,'light-dark(var(--ksf-color-foreground),var(--ksf-color-on-primary))');
   if(d.prop==='color')d.value=d.value.replace(/var\(--color-black\)/g,'light-dark(var(--ksf-color-foreground),var(--ksf-color-on-primary))').replace(/var\(--color-white\)/g,'light-dark(var(--ksf-color-on-primary),var(--ksf-color-foreground))');
  }
 });
 if(['ai-checkout.tsx','ai-connect.tsx','ai-schedule.tsx','ai-attachment.tsx','ai-code-run.tsx','ai-handoff.tsx'].includes(name)){const extra=postcss.parse(await readFile(resolve(sdk,'src/fidelity/loop-motion.css'),'utf8'));extra.walkRules(r=>{if(!isKeyframe(r))r.selector=postcss.list.comma(r.selector).map(s=>moduleScope+' '+s).join(',');});ast.append(...extra.nodes);}
 if(['contact-sheet.tsx','receipt-printer.tsx'].includes(name)){const extra=postcss.parse(await readFile(resolve(sdk,'src/fidelity/physical-material.css'),'utf8'));extra.walkRules(r=>{r.selector=postcss.list.comma(r.selector).map(s=>moduleScope+' '+s).join(',');});ast.append(...extra.nodes);}
 if(name==='carousel-cards.tsx'){const extra=postcss.parse(await readFile(resolve(sdk,'src/fidelity/rail-motion.css'),'utf8'));extra.walkRules(r=>{if(!isKeyframe(r))r.selector=postcss.list.comma(r.selector).map(s=>moduleScope+' '+s).join(',');});ast.append(...extra.nodes);}
 if(name==='liquid-glass-card.tsx'){const extra=postcss.parse(await readFile(resolve(sdk,'src/fidelity/now-playing-roll.css'),'utf8'));extra.walkRules(r=>{if(!isKeyframe(r))r.selector=postcss.list.comma(r.selector).map(s=>moduleScope+' '+s).join(',');});ast.append(...extra.nodes);}
 const css=ast.toString();await writeFile(resolve(sdk,'src/fidelity/styles',name.replace('.tsx','.css')),'/* Generated per module from fixed free Kokonut source; MIT notice is shipped with the SDK. */\n'+css);bytes+=css.length;count++;
 let text=await readFile(file,'utf8'),imp=`import '../styles/${name.replace('.tsx','.css')}';\n`;if(!text.includes(imp)){text=imp+text;await writeFile(file,text);}
}
try{await unlink(resolve(sdk,'src/fidelity/kokonut.css'));}catch(e){if(e.code!=='ENOENT')throw e;}
const scope=resolve(sdk,'src/fidelity/scope.tsx');let text=await readFile(scope,'utf8');await writeFile(scope,text.replace("import './kokonut.css';","import './kokonut-base.css';"));
console.log(JSON.stringify({modules:count,bytes,styles:'per-module; ordinary components do not import these styles'}));
