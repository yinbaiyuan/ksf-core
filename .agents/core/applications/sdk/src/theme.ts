import type {ApplicationSDK} from './application-sdk.ts';

export type ColorTheme = 'light' | 'dark';
export type ThemeMode = ColorTheme | 'system';

/** Semantic roles shared by SDK components, applications and the component catalog. */
export const themeColorDefinitions = Object.freeze({
  background: {label: '内容背景', group: '背景', usage: '应用主要内容区域'},
  surface: {label: '分区背景', group: '背景', usage: '与主背景区分的内容分区'},
  surfaceRaised: {label: '浮层背景', group: '背景', usage: '菜单、弹层或抬高的内容表面'},
  foreground: {label: '正文文字', group: '文字', usage: '标题和主要正文'},
  mutedForeground: {label: '辅助文字', group: '文字', usage: '说明、次要信息；仍需清晰可读'},
  border: {label: '轻边界', group: '边界', usage: '装饰分隔；不单独承担交互控件识别'},
  borderStrong: {label: '交互边界', group: '边界', usage: '需要明确识别的控件轮廓'},
  primary: {label: '主操作色', group: '主色', usage: '主要操作、链接或强调文字'},
  onPrimary: {label: '主色上文字', group: '主色', usage: '仅用于实色主操作背景上的文字'},
  primarySurface: {label: '主色浅底', group: '主色', usage: '轻量强调背景，搭配主操作色文字'},
  focusRing: {label: '焦点轮廓', group: '主色', usage: '键盘焦点的可见轮廓'},
  selection: {label: '选区背景', group: '主色', usage: '选中的文字或项目背景'},
  selectionForeground: {label: '选区文字', group: '主色', usage: '搭配选区背景使用'},
  success: {label: '成功文字', group: '语义', usage: '成功信息的文字或图标'},
  successSurface: {label: '成功背景', group: '语义', usage: '搭配成功文字的浅底'},
  warning: {label: '警告文字', group: '语义', usage: '需要注意的信息文字或图标'},
  warningSurface: {label: '警告背景', group: '语义', usage: '搭配警告文字的浅底'},
  danger: {label: '危险文字', group: '语义', usage: '错误或危险操作的文字与图标'},
  dangerSurface: {label: '危险背景', group: '语义', usage: '搭配危险文字的浅底'},
  info: {label: '提示文字', group: '语义', usage: '普通提示信息的文字或图标'},
  infoSurface: {label: '提示背景', group: '语义', usage: '搭配提示文字的浅底'},
  scrim: {label: '遮罩', group: '背景', usage: '内容遮罩，不用作正文背景'},
} as const);

export type ThemeColorName = keyof typeof themeColorDefinitions;
export type ThemeColors = Readonly<Record<ThemeColorName, string>>;
export const themeColorNames = Object.freeze(Object.keys(themeColorDefinitions) as ThemeColorName[]);

/** Win11-inspired defaults. theme.css and the public color table are generated from these palettes. */
export const themeColors: Readonly<Record<ColorTheme, ThemeColors>> = Object.freeze({
  light: Object.freeze({
    background: '#ffffff', surface: '#f5f6f8', surfaceRaised: '#ffffff',
    foreground: '#1b1b1b', mutedForeground: '#5c5c5c', border: '#0000000f', borderStrong: '#858585',
    primary: '#005fb8', onPrimary: '#ffffff', primarySurface: '#e0eaf3', focusRing: '#005fb8',
    selection: '#e0eaf3', selectionForeground: '#1b1b1b',
    success: '#0f7b0f', successSurface: '#dff6dd', warning: '#9d5d00', warningSurface: '#fff4ce',
    danger: '#c42b1c', dangerSurface: '#fde7e9', info: '#005fb8', infoSurface: '#e0eaf3', scrim: '#0000004d',
  }),
  dark: Object.freeze({
    background: '#242424', surface: '#282828', surfaceRaised: '#2c2c2c',
    foreground: '#ffffff', mutedForeground: '#c5c5c5', border: '#ffffff15', borderStrong: '#898989',
    primary: '#60cdff', onPrimary: '#000000', primarySurface: '#2e393e', focusRing: '#60cdff',
    selection: '#2e393e', selectionForeground: '#ffffff',
    success: '#6ccb5f', successSurface: '#393d1b', warning: '#fce100', warningSurface: '#433519',
    danger: '#ff99a4', dangerSurface: '#442726', info: '#60cdff', infoSurface: '#2e393e', scrim: '#0000004d',
  }),
});

export const themeColorProperties = Object.freeze(Object.fromEntries(themeColorNames.map(name =>
  [name, '--ksf-color-' + name.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())],
)) as Record<ThemeColorName, `--ksf-color-${string}`>);

/** CSS references for inline styles, following the nearest theme boundary automatically. */
export const themeVars = Object.freeze(Object.fromEntries(themeColorNames.map(name =>
  [name, `var(${themeColorProperties[name]})`],
)) as Record<ThemeColorName, `var(--ksf-color-${string})`>);

const owners = new WeakMap<HTMLElement, symbol>();
type ThemeHost = Pick<ApplicationSDK, 'getSnapshot' | 'subscribe'>;

/** Bind an application-owned DOM root. Import theme.css separately; dispose on unmount. */
export function bindTheme(element: HTMLElement, sdk: ThemeHost, options: {theme?: ColorTheme} = {}): () => void {
  const {theme} = options;
  if (theme !== undefined && theme !== 'light' && theme !== 'dark') throw Error('主题只支持 light 或 dark。');
  if (owners.has(element)) throw Error('此容器已绑定主题，请先释放上一次绑定。');
  const token = Symbol('theme'), previous = element.getAttribute('data-ksf-theme');
  let last: ThemeMode, disposed = false;
  owners.set(element, token);
  const restore = () => {
    if (element.getAttribute('data-ksf-theme') === last) {
      if (previous === null) element.removeAttribute('data-ksf-theme');
      else element.setAttribute('data-ksf-theme', previous);
    }
    owners.delete(element);
  };
  const update = () => {
    if (disposed) return;
    const mode = theme ?? sdk.getSnapshot().material.themeMode;
    last = mode === 'light' || mode === 'dark' ? mode : 'system';
    if (element.getAttribute('data-ksf-theme') !== last) element.setAttribute('data-ksf-theme', last);
  };
  let unsubscribe: () => void;
  try { update(); unsubscribe = theme ? () => {} : sdk.subscribe(update); }
  catch (error) { restore(); throw error; }
  return () => {
    if (disposed || owners.get(element) !== token) return;
    disposed = true;
    try { unsubscribe(); } finally { restore(); }
  };
}
