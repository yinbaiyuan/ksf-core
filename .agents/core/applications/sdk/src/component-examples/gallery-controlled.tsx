import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Gallery} from '@ksf/sdk/gallery';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function GalleryControlledExample(){const [ids,setIds]=useState<readonly string[]>(['plan']);return <div className='ksf-demo-stack'><Gallery items={mediaSamples} selectable selectedIds={ids} onSelectionChange={setIds}/><output>已选择 {ids.length} 张</output><Button onClick={()=>setIds([])}>清空</Button></div>;}
