import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {View} from '@ksf/sdk/view';
import {themeVars,themeColorNames,themeColorDefinitions} from '@ksf/sdk/theme';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ThemeNestedBoundariesExample(){return <View direction='row' gap={16} wrap>{(['light','dark'] as const).map(theme=><View key={theme} theme={theme} gap={12} style={{padding:20,border:'1px solid var(--ksf-color-border)',borderRadius:8,flex:1,minWidth:180}}><strong>{theme}主题</strong><p>局部主题覆盖不会更改其他窗口。</p><Button tone='primary' variant='solid'>主要操作</Button><span style={{color:themeVars.mutedForeground}}>辅助文字跟随边界。</span></View>)}</View>;}
