import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Tag} from '@ksf/sdk/tag';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TagIconsExample(){return <div className='ksf-demo-row'><Tag tone='success' icon={<CheckGlyph/>}>已完成</Tag><Tag tone='primary' icon={<FolderGlyph/>}>资料</Tag></div>;}
