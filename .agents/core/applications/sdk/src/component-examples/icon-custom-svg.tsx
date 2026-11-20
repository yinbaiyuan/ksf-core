import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Icon} from '@ksf/sdk/icon';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function IconCustomSvgExample(){return <div className='ksf-demo-row'><Icon icon={SearchGlyph} label='搜索' size={24}/><Icon icon={FolderGlyph} label='资料目录' size={24}/><Icon icon={ArrowGlyph} label='前往' size={24}/><span>SVG组件由应用提供，可独立选择图标来源。</span></div>;}
