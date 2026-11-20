import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Avatar} from '@ksf/sdk/avatar';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function AvatarColorsExample(){return <div className='ksf-demo-row'><Avatar name='设计' style={{background:'var(--ksf-color-primary)',color:'var(--ksf-color-on-primary)'}}/><Avatar name='研究' style={{background:'var(--ksf-color-success)',color:'var(--ksf-color-on-primary)'}}/></div>;}
