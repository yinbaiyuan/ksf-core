import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Avatar} from '@ksf/sdk/avatar';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function AvatarShapeExample(){return <div className='ksf-demo-row'><Avatar name='小林'/><Avatar name='小王' shape='square'/></div>;}
