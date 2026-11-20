import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Avatar} from '@ksf/sdk/avatar';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function AvatarImageExample(){return <div className='ksf-demo-row'><Avatar name='空间方案' src={mediaSamples[0].src}/><Avatar name='加载失败回退' src='data:image/png;base64,broken'/></div>;}
