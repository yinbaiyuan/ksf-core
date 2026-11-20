import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {View} from '@ksf/sdk/view';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ViewCombinationExample(){return <View direction='row' gap={12}><DemoPanel style={{width:72,flexShrink:0}}>封面</DemoPanel><View gap={8} style={{flex:1,minWidth:0}}><strong>研究资料</strong><span>内容区域占用剩余空间，操作靠后排列。</span><View direction='row' justify='flex-end' gap={8}><Button size='small'>查看</Button><Button size='small' variant='solid' tone='primary'>打开</Button></View></View></View>;}
