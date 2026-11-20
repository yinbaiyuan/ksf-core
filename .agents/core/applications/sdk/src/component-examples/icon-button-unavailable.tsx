import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {IconButton} from '@ksf/sdk/icon-button';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function IconButtonUnavailableExample(){return <div className='ksf-demo-row'><IconButton icon={SearchGlyph} label='无权限搜索' disabled/><IconButton icon={FolderGlyph} label='正在读取资料' loading/><IconButton icon={CheckGlyph} label='危险透明图标操作' tone='danger' ghost/></div>;}
