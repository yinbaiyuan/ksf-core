import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Gallery} from '@ksf/sdk/gallery';
export function GalleryStatesExample(){const [selected,setSelected]=useState<readonly string[]>([]);return <div className='ksf-demo-stack'><Gallery items={mediaSamples} minWidth={120} selectable selectedIds={selected} onSelectionChange={setSelected}/><output>已选择：{selected.join('、')||'无'}</output></div>;}
