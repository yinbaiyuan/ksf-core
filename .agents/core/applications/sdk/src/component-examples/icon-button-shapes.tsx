import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {IconButton} from '@ksf/sdk/icon-button';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function IconButtonShapesExample(){return <div className='ksf-demo-row'><IconButton icon={SearchGlyph} label='圆形搜索' shape='circle'/><IconButton icon={FolderGlyph} label='方形资料'/><IconButton icon={CheckGlyph} label='胶囊确认' shape='round'/></div>;}
