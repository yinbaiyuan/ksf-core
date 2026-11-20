import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Avatar} from '@ksf/sdk/avatar';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function AvatarIconExample(){return <Avatar name='资料目录' icon={<FolderGlyph/>} size={48}/>;}
