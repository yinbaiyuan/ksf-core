import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Icon} from '@ksf/sdk/icon';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function IconSizesExample(){return <div className='ksf-demo-stack'>{[14,20,28,40].map(size=><div className='ksf-demo-row' key={size}><Icon icon={FolderGlyph} size={size}/><span>{size}px 图标与相邻说明</span></div>)}</div>;}
