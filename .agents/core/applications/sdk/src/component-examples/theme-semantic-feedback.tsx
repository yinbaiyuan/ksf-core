import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {View} from '@ksf/sdk/view';
import {themeVars,themeColorNames,themeColorDefinitions} from '@ksf/sdk/theme';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ThemeSemanticFeedbackExample(){return <View gap={10}>{(['success','warning','danger','info'] as const).map(tone=><div key={tone} style={{padding:12,borderRadius:6,color:themeVars[tone],background:themeVars[(tone+'Surface') as 'successSurface'|'warningSurface'|'dangerSurface'|'infoSurface']}}>{tone} · 语义信息与背景配对</div>)}</View>;}
