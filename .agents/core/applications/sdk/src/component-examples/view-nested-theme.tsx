import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {View} from '@ksf/sdk/view';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ViewNestedThemeExample(){return <View direction='row' wrap gap={12}>{(['light','dark'] as const).map(theme=><View key={theme} theme={theme} gap={10} style={{padding:16,flex:1,minWidth:180,borderRadius:8}}><strong>{theme}局部边界</strong><View><Button tone='primary' variant='solid'>继承主操作色</Button></View></View>)}</View>;}
