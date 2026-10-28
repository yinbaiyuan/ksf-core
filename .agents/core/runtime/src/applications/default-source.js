// Host policy, not user preferences. Keep this URL stable for installed origins.
export const DEFAULT_APPLICATION_SOURCE = Object.freeze({
  id: 'ksf-apps',
  name: 'KSF 公共应用源',
  url: 'https://yinbaiyuan.github.io/ksf-apps/index.json',
  enabled: true,
  locked: true,
  default: true,
});

export function withDefaultApplicationSource(sources, source = DEFAULT_APPLICATION_SOURCE) {
  const other = sources.filter(item => item.id !== source?.id).map(({locked, default: preferred, ...item}) => ({
    ...item,
    ...(item.id === 'builtin' && item.name === 'KSF 默认应用源' ? {name: 'KSF 随附应用'} : {}),
  }));
  return source ? [{...source}, ...other] : other;
}
