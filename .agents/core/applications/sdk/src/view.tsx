import {createContext, forwardRef, useContext, type HTMLAttributes, type CSSProperties} from 'react';
import {useMaterial} from './components/material-provider';
import type {ColorTheme} from './theme';
import './view.css';

export type ViewTheme = ColorTheme;

export interface ViewProps extends HTMLAttributes<HTMLDivElement> {
  /** Omit to inherit the nearest View, then the SDK host theme (system outside a host). */
  theme?: ViewTheme;
  direction?: 'row' | 'column';
  gap?: CSSProperties['gap'];
  align?: CSSProperties['alignItems'];
  justify?: CSSProperties['justifyContent'];
  wrap?: boolean;
}

const ViewThemeContext = createContext<ViewTheme | 'system' | null>(null);

/** A flex layout and local theme boundary. Spacing and sizing belong to the application. */
export const View = forwardRef<HTMLDivElement, ViewProps>(function View(
  {theme, direction = 'column', gap, align, justify, wrap = false, className = '', style, ...props}, ref,
) {
  const inherited = useContext(ViewThemeContext);
  const {settings} = useMaterial();
  const resolved = theme ?? inherited ?? settings.themeMode ?? 'system';
  return <ViewThemeContext.Provider value={resolved}>
    <div {...props} ref={ref} className={`ksf-view ${className}`.trim()}
      style={{gap, alignItems: align, justifyContent: justify, flexWrap: wrap ? 'wrap' : undefined, ...style}}
      data-ksf-theme={theme !== undefined || inherited === null ? resolved : undefined}
      data-ksf-view-theme={resolved} data-ksf-view-direction={direction}/>
  </ViewThemeContext.Provider>;
});
