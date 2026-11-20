import{i as e}from"./rolldown-runtime-COiEfhsA.js";import{n as t,t as n}from"./jsx-runtime-CldxteV5.js";var r=e(t(),1),i=n(),a=16e5,o=Math.PI*2,s={"top-right":{flipX:0,flipY:0,side:0},"top-left":{flipX:1,flipY:0,side:0},"bottom-right":{flipX:0,flipY:1,side:0},"bottom-left":{flipX:1,flipY:1,side:0},right:{flipX:0,flipY:0,side:1},left:{flipX:1,flipY:0,side:1}},c=`#version 300 es
const vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() {
  gl_Position = vec4(corners[gl_VertexID], 0.0, 1.0);
}`,l=`#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uBlend;
uniform float uIntensity;
uniform float uSpread;
uniform float uDensity;
uniform float uSharpness;
uniform float uFalloff;
uniform float uGlow;
uniform float uSaturation;
uniform float uDust;
uniform float uOpacity;
uniform float uReveal;
uniform float uLight;
uniform vec3 uFrame;
uniform float uAim;
uniform vec3 uFocus;
uniform float uSway;
out vec4 fragColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

float shafts(float u, float t, float seed, float aa) {
  float sway = (0.4 * sin(t * 0.31 + seed) + 0.24 * sin(t * 0.17 + seed * 2.3)) * uSway;
  float n = 0.7 * noise(vec2(u + sway + seed, t * 0.3)) + 0.3 * noise(vec2(u * 2.4 + sway * 1.5 + seed * 1.7, t * 0.45 + 3.0));
  float width = mix(0.5, 0.1, uSharpness);
  float s = mix(smoothstep(0.5 - width, 0.5 + width, n), 0.5, aa);
  return mix(0.05, 1.0, s);
}

float motes(vec2 p, float cell, float t, float seed) {
  p += vec2(t * 0.021, -t * 0.013) + seed * 7.31;
  vec2 grid = p / cell;
  vec2 id = floor(grid);
  vec2 f = grid - id;
  float h = hash(id + seed);
  if (h > 0.5) return 0.0;
  vec2 center = 0.25 + 0.5 * vec2(hash(id + 1.7 + seed), hash(id + 3.1 + seed));
  center += 0.1 * vec2(sin(t * 0.7 + h * 31.0), cos(t * 0.6 + h * 23.0));
  float size = mix(0.035, 0.09, hash(id + 5.3 + seed));
  float edge = length(fwidth(grid)) * 0.7;
  float twinkle = 0.55 + 0.45 * sin(t * 1.9 + h * 41.0);
  return (1.0 - smoothstep(size - edge, size + edge, length(f - center))) * twinkle;
}

void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 q = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  if (uFrame.x > 0.5) q.x = -q.x;
  if (uFrame.y > 0.5) q.y = -q.y;
  vec2 source = uFrame.z > 0.5 ? vec2(aspect * 0.5 + 0.42, 0.3) : vec2(aspect * 0.5 + 0.1, 0.62);
  float heading = (uFrame.z > 0.5 ? 3.42 : -2.48) + uAim + 0.035 * sin(uTime * 0.21) * uSway;
  vec2 v = q - source;
  float r = length(v);
  float angle = mod(atan(v.y, v.x) - heading + 3.14159265, 6.28318531) - 3.14159265;
  float t = uTime;
  float u = angle * uDensity;
  float aa = smoothstep(0.12, 0.45, fwidth(u));
  float offset = uSpread * 0.22;
  float fanA = exp(-pow((angle + offset) / uSpread, 2.0) * 1.4);
  float fanB = exp(-pow((angle - offset) / (uSpread * 1.15), 2.0) * 1.4);
  float focus = 1.0 + uFocus.z * exp(-pow((angle - uFocus.x) / uFocus.y, 2.0));
  float lightA = fanA * shafts(u, t, 0.0, aa) * focus;
  float lightB = fanB * shafts(u * 0.83, t * 0.6, 17.0, aa) * focus;
  float reach = 1.0 / (1.0 + pow(r / 0.4, uFalloff));
  vec3 glowColor = mix(uColorA, uColorB, uBlend);
  vec3 light = (uColorA * lightA * (1.0 - uBlend) + uColorB * lightB * uBlend) * 2.0 * reach;
  light += glowColor * uGlow * exp(-pow(r / 0.4, 2.0));
  if (uDust > 0.0) {
    float sparkle = motes(q, 0.06, t, 0.0) + 0.7 * motes(q, 0.038, t * 0.8, 9.0);
    light += mix(glowColor, vec3(1.0), 0.6) * sparkle * (lightA + lightB) * reach * uDust * 2.5;
  }
  light *= uIntensity * (1.0 - smoothstep(uReveal * 2.6 - 0.45, uReveal * 2.6, r)) * smoothstep(0.0, 0.35, uReveal);
  float gray = dot(light, vec3(0.2126, 0.7152, 0.0722));
  light = max(mix(vec3(gray), light, uSaturation), 0.0);
  float peak = max(light.r, max(light.g, light.b));
  float grain = (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
  if (uLight > 0.5) {
    vec3 ink = pow(light / max(peak, 1e-4), vec3(2.0)) * 0.75;
    float alpha = clamp(pow(1.0 - exp(-peak * 2.6), 2.5) * 0.9 * uOpacity + grain, 0.0, 1.0);
    fragColor = vec4(pow(ink, vec3(1.0 / 2.2)) * alpha, alpha);
    return;
  }
  float mapped = 1.0 - exp(-peak);
  vec3 tone = light * (mapped / max(peak, 1e-4));
  tone = mix(tone, vec3(mapped), smoothstep(0.7, 1.0, mapped) * 0.55);
  vec3 shown = clamp(tone * uOpacity, 0.0, 1.0);
  float alpha = max(shown.r, max(shown.g, shown.b));
  vec3 color = clamp(shown * alpha + grain, 0.0, 1.0);
  fragColor = vec4(min(color, vec3(alpha)), alpha);
}`,u=(e,t,n)=>Math.min(n,Math.max(t,e)),d=e=>((e+Math.PI)%o+o)%o-Math.PI,f=e=>{let t=String(e||``).trim(),n=/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t);if(n){let e=n[1].length===3?n[1].replace(/./g,e=>e+e):n[1];return[0,2,4].map(t=>parseInt(e.slice(t,t+2),16)/255)}let r=/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(t);return r?[r[1],r[2],r[3]].map(e=>u(parseFloat(e)/255,0,1)):[1,1,1]},p=(e,t)=>({source:e.side?[t*.5+.42,.3]:[t*.5+.1,.62],heading:e.side?3.42:-2.48}),m=(e,t,n)=>{let r=e.createShader(t);return r?(e.shaderSource(r,n),e.compileShader(r),e.getShaderParameter(r,e.COMPILE_STATUS)?r:(console.error(e.getShaderInfoLog(r)),e.deleteShader(r),null)):null},h=e=>{let t=m(e,e.VERTEX_SHADER,c),n=m(e,e.FRAGMENT_SHADER,l),r=t&&n?e.createProgram():null;if(!t||!n||!r)return t&&e.deleteShader(t),n&&e.deleteShader(n),null;if(e.attachShader(r,t),e.attachShader(r,n),e.linkProgram(r),e.deleteShader(t),e.deleteShader(n),!e.getProgramParameter(r,e.LINK_STATUS))return console.error(e.getProgramInfoLog(r)),e.deleteProgram(r),null;let i={},a=e.getProgramParameter(r,e.ACTIVE_UNIFORMS);for(let t=0;t<a;t++){let n=e.getActiveUniform(r,t);n&&(i[n.name]=e.getUniformLocation(r,n.name))}return{program:r,uniforms:i}},g=({rayColor1:e=`#FFC46B`,rayColor2:t=`#96c8ff`,blend:n=.6,origin:o=`top-right`,speed:c=2.5,intensity:l=2,spread:m=2,density:g=5,sharpness:_=.5,tilt:v=0,falloff:y=1.6,glow:b=1,saturation:x=1,dust:S=0,followMouse:C=!0,mouseInfluence:w=.5,intro:T=!0,lightMode:E=!1,opacity:D=1,maxDevicePixelRatio:O=2,className:k=``,style:A})=>{let j=(0,r.useRef)(null),M=(0,r.useRef)(null),N=(0,r.useRef)(null),[P,F]=(0,r.useState)(0),[I,L]=(0,r.useState)(!1),R={colorA:f(e),colorB:f(t),blend:u(n,0,1),frame:s[o]??s[`top-right`],speed:Math.max(0,c)*.4,intensity:Math.max(0,l)*.75,spread:u(m,.1,8)*.225,density:u(g,1,40),sharpness:u(_,0,1),tilt:u(v,-180,180)*Math.PI/180,falloff:u(y,.2,6),glow:Math.max(0,b)*1.2,saturation:Math.max(0,x),dust:u(S,0,1),followMouse:C,mouseInfluence:u(w,0,1),intro:T,light:E,opacity:u(D,0,1),maxRatio:u(O,.5,3)},z=(0,r.useRef)(R);return z.current=R,(0,r.useEffect)(()=>{N.current?.()}),(0,r.useEffect)(()=>{let e=j.current,t=M.current;if(!e||!t)return;let n=null;try{n=t.getContext(`webgl2`,{alpha:!0,premultipliedAlpha:!0,antialias:!1,depth:!1,stencil:!1,powerPreference:`low-power`})}catch{}let r=n?h(n):null;if(L(!!n&&!!r),!n||!r)return;let i=window.matchMedia(`(prefers-reduced-motion: reduce)`),o=i.matches,s=n.createVertexArray(),c={width:1,height:1},l={x:0,y:0,inside:!1},f={value:0,velocity:0},m={angle:0,strength:0},g=Math.random()*100,_=z.current.intro&&!o&&P===0?0:1,v=0,y=0,b=!0,x=document.visibilityState!==`hidden`,S=!1,C=!1,w=()=>{let n=z.current;n.followMouse||(f.value=0,f.velocity=0,m.strength=0);let r=e.getBoundingClientRect(),i=Math.max(1,r.width),o=Math.max(1,r.height),s=Math.min(window.devicePixelRatio||1,n.maxRatio,Math.sqrt(a/(i*o))),l=Math.max(1,Math.round(i*s)),u=Math.max(1,Math.round(o*s));(t.width!==l||t.height!==u)&&(t.width=l,t.height=u),c.width=i,c.height=o},T=()=>{C=!0,O()},E=e=>{let t=(l.x-c.width/2)/c.height,n=(c.height/2-l.y)/c.height;e.frame.flipX&&(t=-t),e.frame.flipY&&(n=-n);let{source:r,heading:i}=p(e.frame,c.width/c.height);return d(Math.atan2(n-r[1],t-r[0])-i-e.tilt)},D=e=>{if(v=0,S||!b||!x)return;if(e-y<1e3/30){v=requestAnimationFrame(D);return}if(C&&(C=!1,w()),S)return;let i=z.current,a=u((e-y)/1e3||0,0,.05);y=Math.max(y,e),g+=a*i.speed*+!o,_<1&&(_=Math.min(1,_+a/1.6));let c=i.followMouse&&l.inside&&!o,d=c?E(i):0,p=c?u(d,-i.spread,i.spread)*i.mouseInfluence:0,h=c?i.mouseInfluence:0,T=1-Math.exp(-a*6);c&&(m.angle+=(u(d-f.value,-i.spread*1.5,i.spread*1.5)-m.angle)*T),m.strength+=(h-m.strength)*T;let O=2*Math.sqrt(18);f.velocity+=((p-f.value)*18-f.velocity*O)*a,f.value+=f.velocity*a,n.viewport(0,0,t.width,t.height),n.useProgram(r.program),n.bindVertexArray(s);let k=r.uniforms;n.uniform2f(k.uResolution,t.width,t.height),n.uniform1f(k.uTime,g),n.uniform3f(k.uColorA,i.colorA[0],i.colorA[1],i.colorA[2]),n.uniform3f(k.uColorB,i.colorB[0],i.colorB[1],i.colorB[2]),n.uniform1f(k.uBlend,i.blend),n.uniform1f(k.uIntensity,i.intensity),n.uniform1f(k.uSpread,i.spread),n.uniform1f(k.uDensity,i.density),n.uniform1f(k.uSharpness,i.sharpness),n.uniform1f(k.uFalloff,i.falloff),n.uniform1f(k.uGlow,i.glow),n.uniform1f(k.uSaturation,i.saturation),n.uniform1f(k.uDust,i.dust),n.uniform1f(k.uOpacity,i.opacity),n.uniform1f(k.uReveal,1-(1-_)**3),n.uniform1f(k.uLight,+!!i.light),n.uniform3f(k.uFrame,i.frame.flipX,i.frame.flipY,i.frame.side),n.uniform1f(k.uAim,i.tilt+f.value),n.uniform3f(k.uFocus,m.angle,Math.max(.06,i.spread*.25),m.strength*1.4),n.uniform1f(k.uSway,+!o),n.drawArrays(n.TRIANGLES,0,3);let A=Math.abs(p-f.value)>1e-4||Math.abs(f.velocity)>1e-4||Math.abs(h-m.strength)>.001;(i.speed>0&&!o||_<1||A)&&b&&x&&(v=requestAnimationFrame(D))},O=()=>{!v&&!S&&b&&x&&(y=performance.now(),v=requestAnimationFrame(D))};N.current=()=>{T(),O()};let k=t=>{let n=e.getBoundingClientRect();l.x=t.clientX-n.left,l.y=t.clientY-n.top,l.inside=t.clientX>=n.left&&t.clientX<=n.right&&t.clientY>=n.top&&t.clientY<=n.bottom,O()},A=()=>{l.inside=!1,O()},I=e=>{e.pointerType!==`mouse`&&A()};window.addEventListener(`pointermove`,k,{passive:!0}),window.addEventListener(`pointerup`,I,{passive:!0}),window.addEventListener(`pointercancel`,I,{passive:!0}),document.documentElement.addEventListener(`pointerleave`,A);let R=e=>{e.preventDefault(),S=!0,L(!1),cancelAnimationFrame(v),v=0},B=()=>F(e=>e+1);t.addEventListener(`webglcontextlost`,R),t.addEventListener(`webglcontextrestored`,B);let V=new ResizeObserver(()=>{T(),O()});V.observe(e);let H=new IntersectionObserver(e=>{b=e.some(e=>e.isIntersecting),b||(cancelAnimationFrame(v),v=0),O()});H.observe(e);let U=()=>{x=document.visibilityState!==`hidden`,x||(cancelAnimationFrame(v),v=0),O()};document.addEventListener(`visibilitychange`,U);let W=()=>{o=i.matches,o&&(_=1,f.value=0,f.velocity=0,m.strength=0),O()};return i.addEventListener(`change`,W),T(),O(),()=>{cancelAnimationFrame(v),N.current=null,V.disconnect(),H.disconnect(),window.removeEventListener(`pointermove`,k),window.removeEventListener(`pointerup`,I),window.removeEventListener(`pointercancel`,I),document.documentElement.removeEventListener(`pointerleave`,A),document.removeEventListener(`visibilitychange`,U),i.removeEventListener(`change`,W),t.removeEventListener(`webglcontextlost`,R),t.removeEventListener(`webglcontextrestored`,B),n.isContextLost()||(n.deleteVertexArray(s),n.deleteProgram(r.program))}},[P]),(0,i.jsx)(`div`,{ref:j,"data-renderer":I?`webgl`:`fallback`,className:`side-rays${k?` ${k}`:``}`,style:A,children:(0,i.jsx)(`canvas`,{ref:M,className:`side-rays__canvas`,"aria-hidden":`true`})})};export{g as default};