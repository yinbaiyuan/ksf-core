// Adapted from React Bits Glass Icons, cf2801031f07f53d4684e65b961bde7c2e2a6921.
// Host-private shader/spring engine. MIT + Commons Clause: see scripts/licenses/react-bits-glass-icons.txt.
type Gradient = { angle: number; stops: [number, string][] };

type Motion = {
  h: number;
  hv: number;
  ht: number;
  p: number;
  pv: number;
  pt: number;
  x: number;
  xv: number;
  xt: number;
  y: number;
  yv: number;
  yt: number;
  e: number;
  ev: number;
  et: number;
  at: number;
};

export type Settings = {
  count: number;
  tile: number;
  radius: number;
  edge: number;
  strength: number;
  split: number;
  soft: number;
  shine: number;
  shade: number;
  tint: string;
  tintOpacity: number;
  glassOpacity: number;
  plate: string;
  hover: string;
  labels: string;
  tilt: number;
  spread: number;
  parallax: number;
  intro: boolean;
  colors: string[];
  colorKey: string;
};

export type Engine = {
  hover: (index: number, on: boolean) => void;
  aim: (index: number, x: number, y: number) => void;
  press: (index: number, on: boolean) => void;
  sync: () => void;
};

const SIDES:Record<string,number>={top:0,right:90,bottom:180,left:270};
const STAGGER=.07;
const PLATE_CODES:Record<string,number>={none:0,tilt:1,offset:2,circle:3};
const VERTEX = `#version 300 es
in vec2 aCorner;
uniform vec2 uCanvas;
uniform vec2 uCenter;
uniform float uExtent;
out vec2 vLocal;
void main() {
  vLocal = aCorner * uExtent;
  vec2 position = (uCenter + vLocal) / uCanvas * 2.0 - 1.0;
  gl_Position = vec4(position.x, -position.y, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vLocal;
out vec4 outColor;
uniform float uSize;
uniform float uRadius;
uniform float uBevel;
uniform float uStrength;
uniform float uSplit;
uniform float uSoft;
uniform float uShine;
uniform float uShade;
uniform vec4 uTint;
uniform vec2 uLight;
uniform int uPlate;
uniform vec2 uOrigin;
uniform mat2 uTurn;
uniform vec2 uShift;
uniform vec2 uOffset;
uniform float uScale;
uniform float uDisc;
uniform float uRow;
uniform vec2 uDirection;
uniform float uSpan;
uniform sampler2D uGradients;
uniform vec2 uLift;
uniform float uGlassScale;
uniform float uGlassAlpha;
uniform float uPlateAlpha;
uniform float uOpacity;
uniform float uPixel;

float roundBox(vec2 p, float reach, float radius) {
  vec2 q = abs(p) - vec2(reach - radius);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

vec2 roundNormal(vec2 p, float reach, float radius) {
  vec2 q = abs(p) - vec2(reach - radius);
  vec2 s = vec2(p.x < 0.0 ? -1.0 : 1.0, p.y < 0.0 ? -1.0 : 1.0);
  if (q.x > 0.0 && q.y > 0.0) return normalize(q) * s;
  return q.x > q.y ? vec2(s.x, 0.0) : vec2(0.0, s.y);
}

vec4 plate(vec2 p, float soft) {
  if (uPlate == 0) return vec4(0.0);
  vec2 q = uTurn * ((p - uOrigin - uShift) / uScale) + uOrigin - uOffset;
  float d = uPlate == 3 ? length(q) - uDisc : roundBox(q, uSize * 0.5, uRadius);
  float a = clamp(0.5 - d / soft, 0.0, 1.0);
  if (a <= 0.0) return vec4(0.0);
  float t = clamp(dot(q, uDirection) / uSpan + 0.5, 0.0, 1.0);
  return vec4(texture(uGradients, vec2(t, uRow)).rgb * a, a);
}

void main() {
  vec2 p = vLocal;
  float reach = uSize * 0.5;
  vec2 g = (p - uLift) / uGlassScale;
  float dg = roundBox(g, reach, uRadius);
  float glass = clamp(0.5 - dg * uGlassScale / uPixel, 0.0, 1.0) * uGlassAlpha;

  vec4 color = plate(p, uPixel) * uPlateAlpha;
  if (color.a > 0.0) {
    float drop = roundBox(g - vec2(0.0, uSize * 0.1), reach, uRadius);
    color.rgb *= 1.0 - (1.0 - smoothstep(-uSize * 0.12, uSize * 0.14, drop)) * 0.28 * uGlassAlpha;
  }

  if (glass > 0.0) {
    float inside = max(0.0, -dg);
    float t = 1.0 - clamp(inside / uBevel, 0.0, 1.0);
    vec2 n = roundNormal(g, reach, uRadius);
    vec2 bend = n * pow(t, 2.2);
    vec4 seen = vec4(0.0);
    if (uPlate != 0) {
      vec4 red = plate(p - bend * (uStrength + uSplit), uSoft);
      vec4 green = plate(p - bend * uStrength, uSoft);
      vec4 blue = plate(p - bend * (uStrength - uSplit), uSoft);
      seen = vec4(red.r, green.g, blue.b, green.a) * uPlateAlpha;
      float luma = dot(seen.rgb, vec3(0.2126, 0.7152, 0.0722));
      seen.rgb = clamp(mix(vec3(luma), seen.rgb, 1.25) * 1.04, 0.0, 1.0);
      seen.rgb = min(mix(seen.rgb, uTint.rgb * seen.a, uTint.a), vec3(seen.a));
    }
    float facing = dot(n, uLight);
    float rim = clamp(inside / 1.2, 0.0, 1.0);
    float shade = (max(-facing, 0.0) * 0.75 + 0.25) * t * t * rim * uShade;
    float light = clamp((max(facing, 0.0) * 0.95 + max(-facing, 0.0) * 0.35) * t * t * t * rim * uShine, 0.0, 1.0);
    seen = seen * (1.0 - shade) + vec4(0.0, 0.0, 0.0, shade);
    seen = seen * (1.0 - light) + vec4(light);
    color = mix(color, seen, glass);
  }
  outColor = color * uOpacity;
}`;

const UNIFORMS = [
  'uCanvas',
  'uCenter',
  'uExtent',
  'uSize',
  'uRadius',
  'uBevel',
  'uStrength',
  'uSplit',
  'uSoft',
  'uShine',
  'uShade',
  'uTint',
  'uLight',
  'uPlate',
  'uOrigin',
  'uTurn',
  'uShift',
  'uOffset',
  'uScale',
  'uDisc',
  'uRow',
  'uDirection',
  'uSpan',
  'uGradients',
  'uLift',
  'uGlassScale',
  'uGlassAlpha',
  'uPlateAlpha',
  'uOpacity',
  'uPixel'
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const ease = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const fade = (from: number, to: number, t: number) => {
  const x = clamp((t - from) / (to - from), 0, 1);
  return x * x * (3 - 2 * x);
};

const drive = (
  value: number,
  velocity: number,
  target: number,
  stiffness: number,
  damping: number,
  dt: number
): [number, number] => {
  const next = velocity + (stiffness * (target - value) - damping * velocity) * dt;
  return [value + next * dt, next];
};

const splitTopLevel = (text: string) => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    else if (text[i] === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
};

const parseGradient = (value: string): Gradient => {
  const text = String(value).trim();
  const match = /^linear-gradient\((.*)\)$/is.exec(text);
  if (!match) {
    return {
      angle: 180,
      stops: [
        [0, text],
        [1, text]
      ]
    };
  }
  const parts = splitTopLevel(match[1]);
  const head = parts[0].toLowerCase();
  let angle = 180;
  if (/^-?[\d.]+(deg|turn|rad|grad)$/.test(head)) {
    const number = parseFloat(head);
    if (head.endsWith('turn')) angle = number * 360;
    else if (head.endsWith('grad')) angle = number * 0.9;
    else if (head.endsWith('rad')) angle = (number * 180) / Math.PI;
    else angle = number;
    parts.shift();
  } else if (head.startsWith('to ')) {
    const sides = head.slice(3).split(/\s+/);
    const vertical = sides.includes('top') ? -1 : sides.includes('bottom') ? 1 : 0;
    const horizontal = sides.includes('left') ? -1 : sides.includes('right') ? 1 : 0;
    angle = sides.length === 1 ? (SIDES[sides[0]] ?? 180) : (Math.atan2(horizontal, -vertical) * 180) / Math.PI;
    parts.shift();
  }
  const stops = parts.map((part): [number | null, string] => {
    const stop = /^(.*?)\s+(-?[\d.]+)%$/.exec(part);
    return stop ? [Number(stop[2]) / 100, stop[1].trim()] : [null, part];
  });
  if (!stops.length) stops.push([0, '#ffffff']);
  if (stops[0][0] === null) stops[0][0] = 0;
  if (stops[stops.length - 1][0] === null) stops[stops.length - 1][0] = 1;
  for (let i = 1; i < stops.length - 1; i++) {
    if (stops[i][0] !== null) continue;
    let next = i + 1;
    while (stops[next][0] === null) next++;
    const from = stops[i - 1][0] as number;
    stops[i][0] = from + ((stops[next][0] as number) - from) / (next - i + 1);
  }
  return { angle, stops: stops as [number, string][] };
};

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
};

const poseOf = (state: Motion, s: Settings) => {
  const size = s.tile;
  const enter = clamp(state.e, 0, 1);
  const swing = ease((enter - 0.18) / 0.82);
  const hover = state.h;
  const lift = s.hover === 'lift' ? hover : 0;
  const clear = s.plate === 'none';
  let liftY = 0;
  let glassScale = 1;
  if (!clear && s.hover === 'lift') liftY = -0.08 * size * hover;
  if (!clear && s.hover === 'float') liftY = -0.14 * size * hover;
  if (s.hover === 'press') {
    liftY = clear ? 0 : -0.03 * size * hover;
    glassScale = 1 - 0.08 * state.p;
  }
  const settle = clear ? 1 : 0.92 + 0.08 * ease(enter);
  const glyphRise = (1 - ease((enter - 0.25) / 0.75)) * 0.1 * size;
  const shift = [-state.x * s.parallax * 0.07 * size, -state.y * s.parallax * 0.07 * size];
  let angle = 0;
  let offset: [number, number] = [0, 0];
  let grow = 1;
  if (s.plate === 'tilt') {
    angle = (s.tilt + 10 * lift) * swing;
    offset = [-0.08 * size * lift, -0.08 * size * lift];
  } else if (s.plate === 'offset') {
    // The Dock keeps its offset plate while allowing a separate user tilt.
    angle = s.tilt * swing;
    const reach = s.spread * (0.26 + 0.08 * lift) * size * swing;
    offset = [reach, -reach];
  } else if (s.plate === 'circle') {
    const reach = (s.spread * (0.24 + 0.06 * lift) + 0.06 * lift) * size * swing;
    offset = [reach, -reach];
    grow = 1 + 0.08 * lift;
  }
  const light = [-0.55 + state.x * 0.35, -0.83 + state.y * 0.35];
  const length = Math.hypot(light[0], light[1]) || 1;
  return {
    liftY,
    glassScale: clear ? 1 : glassScale * settle,
    domScale: clear ? 1 : glassScale * settle,
    glassAlpha: fade(0, 0.55, enter) * s.glassOpacity,
    plateAlpha: fade(0, 0.35, enter),
    faceY: (clear ? -0.05 * size * hover : liftY) + glyphRise,
    faceScale: glassScale,
    faceAlpha: fade(0.3, 0.85, enter),
    plateScale: (s.hover === 'press' ? 1 - 0.08 * state.p : 1) * grow,
    shift,
    angle,
    offset,
    bend: 1 + 1.2 * (1 - ease(enter)),
    glow: 1 + (clear ? 0.6 : 0.25) * hover,
    light: [light[0] / length, light[1] / length]
  };
};


export type GlassFrame = {settings:Settings;anchors:HTMLElement[];items:HTMLElement[];plates:HTMLElement[];glasses:HTMLElement[];faces:HTMLElement[];opacity?:(anchor:HTMLElement)=>number;static:boolean};
export function createGlassEngine(root:HTMLElement,canvas:HTMLCanvasElement,read:()=>GlassFrame,setGpu:(on:boolean)=>void){
 const settingsRef={get current(){return read().settings;}};
 const plateRefs={get current(){return read().plates;}};
 const glassRefs={get current(){return read().glasses;}};
 const faceRefs={get current(){return read().faces;}};
 const labelRefs={current:[] as HTMLElement[]};
 const engineRef={current:null as Engine|null};
    const reduce = read().static;
    const states = new WeakMap<HTMLElement,{appId:string|undefined;motion:Motion}>();
    const layout = { width: 1, height: 1, margin: 0, dpr: 1, opacities: [] as number[], centers: [] as number[][] };
    const paint = document.createElement('canvas');
    const paintContext = paint.getContext('2d');
    let gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let texture: WebGLTexture | null = null;
    let vertex: WebGLShader | null = null;
    let fragment: WebGLShader | null = null;
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    let gradientKey = '';
    let gradients: Gradient[] = [];
    let tintKey = '';
    let tintColor = [1, 1, 1];
    let raf = 0;
    let last = 0;
    let alive = true;
    let entered = false;

    if (gl) {
      vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
      fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
      program = gl.createProgram();
      if (vertex && fragment && program) {
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
      }
      if (!program || !vertex || !fragment || !gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl = null;
      } else {
        gl.useProgram(program);
        buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const corner = gl.getAttribLocation(program, 'aCorner');
        gl.enableVertexAttribArray(corner);
        gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
        for (const name of UNIFORMS) uniforms[name] = gl.getUniformLocation(program, name);
        texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(uniforms.uGradients, 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }
    }
    setGpu(Boolean(gl));

    const stateOf = (index: number): Motion => {
      const anchor=read().anchors[index],cached=states.get(anchor);
      if(cached&&cached.appId===anchor.dataset.layerApp)return cached.motion;
      const start = settingsRef.current.intro && !reduce ? 0 : 1;
      const motion:Motion={h:0,hv:0,ht:0,p:0,pv:0,pt:0,x:0,xv:0,xt:0,y:0,yv:0,yt:0,e:start,ev:0,et:start,at:0};
      states.set(anchor,{appId:anchor.dataset.layerApp,motion});
      return motion;
    };

    const refreshTextures = () => {
      const s = settingsRef.current;
      if (paintContext && s.tint !== tintKey) {
        tintKey = s.tint;
        paint.width = 1;
        paint.height = 1;
        paintContext.fillStyle = '#ffffff';
        paintContext.fillStyle = String(s.tint);
        paintContext.fillRect(0, 0, 1, 1);
        const [r, g, b] = paintContext.getImageData(0, 0, 1, 1).data;
        tintColor = [r / 255, g / 255, b / 255];
      }
      if (!gl || !paintContext || s.colorKey === gradientKey) return;
      gradientKey = s.colorKey;
      gradients = s.colors.map(parseGradient);
      paint.width = 256;
      paint.height = Math.max(1, gradients.length);
      gradients.forEach((gradient, row) => {
        const fill = paintContext.createLinearGradient(0, 0, 256, 0);
        gradient.stops.forEach(([at, color]) => {
          try {
            fill.addColorStop(clamp(at, 0, 1), color);
          } catch {
            fill.addColorStop(clamp(at, 0, 1), '#ffffff');
          }
        });
        paintContext.fillStyle = fill;
        paintContext.fillRect(0, row, 256, 1);
      });
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paint);
    };

    const measure = () => {
      const s = settingsRef.current;
      const margin = Math.ceil(s.tile * 0.7);
      layout.margin = margin;
      layout.width = Math.max(1, root.clientWidth + margin * 2);
      layout.height = Math.max(1, root.clientHeight + margin * 2);
      layout.dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.left = `${-margin}px`;
      canvas.style.top = `${-margin}px`;
      canvas.style.width = `${layout.width}px`;
      canvas.style.height = `${layout.height}px`;
      const width = Math.round(layout.width * layout.dpr);
      const height = Math.round(layout.height * layout.dpr);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const origin = root.getBoundingClientRect();
      const frame = read();
      layout.opacities=[];
      layout.centers = frame.anchors.map((icon, i) => {
        const r = icon.getBoundingClientRect();
        const x = r.left - origin.left, y = r.top - origin.top;
        frame.items[i].style.transform = `translate(${x}px, ${y}px)`;
        frame.items[i].style.width = `${r.width}px`;
        frame.items[i].style.height = `${r.height}px`;
        frame.items[i].classList.toggle('is-focused',icon.parentElement?.matches(':focus-visible')??false);
        const opacity=(frame.opacity?.(icon)??1)*(icon.parentElement?.getAttribute('aria-disabled')==='true'?.55:1);
        layout.opacities.push(opacity);frame.items[i].style.opacity=String(opacity);
        return [x + r.width / 2 + margin, y + r.height / 2 + margin];
      });
    };

    const applyDom = () => {
      const s = settingsRef.current;
      for (let i = 0; i < s.count; i++) {
        const pose = poseOf(stateOf(i), s);
        const glass = glassRefs.current[i];
        if (glass) {
          glass.style.transform = `translate3d(0, ${pose.liftY.toFixed(2)}px, 0) scale(${pose.domScale.toFixed(4)})`;
          glass.style.opacity = pose.glassAlpha.toFixed(3);
        }
        const face = faceRefs.current[i];
        if (face) {
          face.style.transform = `translate3d(0, ${pose.faceY.toFixed(2)}px, 0) scale(${pose.faceScale.toFixed(4)})`;
          face.style.opacity = pose.faceAlpha.toFixed(3);
        }
        const label = labelRefs.current[i];
        if (label && s.labels === 'always') label.style.opacity = pose.faceAlpha.toFixed(3);
        const card = plateRefs.current[i];
        if (card) {
          const [sx, sy] = pose.shift;
          const [ox, oy] = pose.offset;
          card.style.transform = `translate(${sx.toFixed(2)}px, ${sy.toFixed(2)}px) scale(${pose.plateScale.toFixed(4)}) rotate(${pose.angle.toFixed(3)}deg) translate(${ox.toFixed(2)}px, ${oy.toFixed(2)}px)`;
          card.style.opacity = pose.plateAlpha.toFixed(3);
        }
      }
    };

    const draw = () => {
      if (!gl) return;
      const s = settingsRef.current;
      refreshTextures();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!s.count) return;
      const size = s.tile;
      gl.uniform2f(uniforms.uCanvas, layout.width, layout.height);
      gl.uniform1f(uniforms.uExtent, size * 1.08);
      gl.uniform1f(uniforms.uSize, size);
      gl.uniform1f(uniforms.uRadius, Math.min(s.radius, size / 2));
      gl.uniform1f(uniforms.uBevel, s.edge);
      gl.uniform1f(uniforms.uSoft, s.soft);
      gl.uniform1f(uniforms.uShade, s.shade);
      gl.uniform4f(uniforms.uTint, tintColor[0], tintColor[1], tintColor[2], s.tintOpacity);
      gl.uniform1i(uniforms.uPlate, PLATE_CODES[s.plate]);
      gl.uniform1f(uniforms.uDisc, size * 0.41);
      gl.uniform1f(uniforms.uPixel, 1 / layout.dpr);
      const origin = s.plate === 'tilt' ? size / 2 : 0;
      gl.uniform2f(uniforms.uOrigin, origin, origin);
      for (let i = 0; i < s.count; i++) {
        const center = layout.centers[i];
        if (!center || center[0]<-size || center[1]<-size || center[0]>layout.width+size || center[1]>layout.height+size) continue;
        const pose = poseOf(stateOf(i), s);
        const gradient = gradients[i] ?? { angle: 180 };
        const turn = (-pose.angle * Math.PI) / 180;
        const box = s.plate === 'circle' ? size * 0.82 : size;
        const direction = (gradient.angle * Math.PI) / 180;
        const dx = Math.sin(direction);
        const dy = -Math.cos(direction);
        gl.uniform2f(uniforms.uCenter, center[0], center[1]);
        gl.uniform1f(uniforms.uStrength, s.strength * pose.bend);
        gl.uniform1f(uniforms.uSplit, s.split * pose.bend);
        gl.uniform1f(uniforms.uShine, s.shine * pose.glow);
        gl.uniform2f(uniforms.uLight, pose.light[0], pose.light[1]);
        gl.uniformMatrix2fv(uniforms.uTurn, false, [Math.cos(turn), Math.sin(turn), -Math.sin(turn), Math.cos(turn)]);
        gl.uniform2f(uniforms.uShift, pose.shift[0], pose.shift[1]);
        gl.uniform2f(uniforms.uOffset, pose.offset[0], pose.offset[1]);
        gl.uniform1f(uniforms.uScale, pose.plateScale);
        gl.uniform1f(uniforms.uRow, (i + 0.5) / Math.max(1, gradients.length));
        gl.uniform2f(uniforms.uDirection, dx, dy);
        gl.uniform1f(uniforms.uSpan, Math.max(1, Math.abs(box * dx) + Math.abs(box * dy)));
        gl.uniform2f(uniforms.uLift, 0, pose.liftY);
        gl.uniform1f(uniforms.uGlassScale, pose.glassScale);
        gl.uniform1f(uniforms.uGlassAlpha, pose.glassAlpha);
        gl.uniform1f(uniforms.uPlateAlpha, pose.plateAlpha);
        gl.uniform1f(uniforms.uOpacity,layout.opacities[i]??1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    };

    const tick = (now: number) => {
      raf = 0;
      if (!alive) return;
      const s = settingsRef.current;
      const time = now / 1000;
      const dt = last ? Math.min(1 / 30, time - last) : 1 / 60;
      last = time;
      const steps = Math.max(1, Math.ceil(dt * 240));
      const h = dt / steps;
      let moving = false;
      for (let i = 0; i < s.count; i++) {
        const state = stateOf(i);
        if (state.et === 0) {
          if (entered && time >= state.at) state.et = 1;
          else moving = moving || entered;
        }
        if (read().static) {
          state.h = state.ht;
          state.p = state.pt;
          state.x = state.xt;
          state.y = state.yt;
          state.e = state.et;
          continue;
        }
        for (let k = 0; k < steps; k++) {
          [state.h, state.hv] = drive(state.h, state.hv, state.ht, 170, 24, h);
          [state.p, state.pv] = drive(state.p, state.pv, state.pt, 420, 40, h);
          [state.x, state.xv] = drive(state.x, state.xv, state.xt, 90, 19, h);
          [state.y, state.yv] = drive(state.y, state.yv, state.yt, 90, 19, h);
          [state.e, state.ev] = drive(state.e, state.ev, state.et, 60, 15.5, h);
        }
        const pairs: [keyof Motion, keyof Motion, keyof Motion][] = [
          ['h', 'hv', 'ht'],
          ['p', 'pv', 'pt'],
          ['x', 'xv', 'xt'],
          ['y', 'yv', 'yt'],
          ['e', 'ev', 'et']
        ];
        for (const [value, velocity, target] of pairs) {
          if (Math.abs(state[target] - state[value]) < 0.0005 && Math.abs(state[velocity]) < 0.001) {
            state[value] = state[target];
            state[velocity] = 0;
          } else {
            moving = true;
          }
        }
      }
      applyDom();
      draw();
      if (moving) raf = requestAnimationFrame(tick);
      else last = 0;
    };

    const wake = () => {
      if (!raf && alive) raf = requestAnimationFrame(tick);
    };

    const visibility = new IntersectionObserver(
      entries => {
        if (entered || !entries.some(entry => entry.isIntersecting)) return;
        entered = true;
        const time = performance.now() / 1000;
        for (let i = 0; i < settingsRef.current.count; i++) stateOf(i).at = time + i * STAGGER;
        wake();
      },
      { threshold: 0.15 }
    );
    visibility.observe(root);

    const resizeObserver = new ResizeObserver(() => {
      measure();
      applyDom();
      draw();
    });
    resizeObserver.observe(root);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      gl = null;
      setGpu(false);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

    engineRef.current = {
      hover: (index: number, on: boolean) => {
        const state = stateOf(index);
        state.ht = on ? 1 : 0;
        if (!on) {
          state.xt = 0;
          state.yt = 0;
          state.pt = 0;
        }
        wake();
      },
      aim: (index: number, x: number, y: number) => {
        const state = stateOf(index);
        state.xt = x;
        state.yt = y;
        wake();
      },
      press: (index: number, on: boolean) => {
        stateOf(index).pt = on ? 1 : 0;
        wake();
      },
      sync: () => {
        measure();
        applyDom();
        draw();
        wake();
      }
    };
    engineRef.current.sync();

    const dispose = () => {
      alive = false;
      cancelAnimationFrame(raf);
      engineRef.current = null;
      visibility.disconnect();
      resizeObserver.disconnect();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      if (gl) {
        gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
      }
    };

    return {engine: engineRef.current!, dispose};
}
