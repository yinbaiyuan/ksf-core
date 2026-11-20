import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {View} from '@ksf/sdk/view';
import {themeVars,themeColorNames,themeColorDefinitions} from '@ksf/sdk/theme';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ThemeTokensExample(){return <View gap={12}><div style={{padding:16,border:'1px solid '+themeVars.borderStrong,borderRadius:8,background:themeVars.surfaceRaised,color:themeVars.foreground}}>使用themeVars表达角色，不手写主题判断。</div><Button tone='primary' variant='solid'>主操作</Button><Button tone='danger'>危险操作</Button><output style={{color:themeVars.success}}>状态已更新</output></View>;}
