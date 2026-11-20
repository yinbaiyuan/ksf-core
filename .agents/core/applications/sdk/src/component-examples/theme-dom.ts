import '@ksf/sdk/theme.css';
import type {ApplicationSDK} from '@ksf/sdk/application-sdk';
import {bindTheme, themeVars, themeColors, themeColorNames, themeColorProperties, themeColorDefinitions, type ThemeColorName, type ColorTheme} from '@ksf/sdk/theme';

export function mountThemeExample(container: HTMLElement, sdk: ApplicationSDK, options: {theme?: ColorTheme} = {}) {
  const disposeTheme = bindTheme(container, sdk, options);
  const role: ThemeColorName = 'foreground';
  const mode: ColorTheme = 'light';
  container.style.color = themeVars[role];
  container.style.background = themeVars.background;
  container.textContent = themeColorNames.length + '项语义色：' + themeColorDefinitions[role].label;
  void themeColors[mode][role]; void themeColorProperties[role];
  return {dispose() {disposeTheme(); container.textContent = '';}};
}
