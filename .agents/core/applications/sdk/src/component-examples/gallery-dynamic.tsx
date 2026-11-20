import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Gallery} from '@ksf/sdk/gallery';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function GalleryDynamicExample(){const [items,setItems]=useState(mediaSamples);return <div className='ksf-demo-stack'><Button onClick={()=>setItems(items.length?[]:mediaSamples)}>清空／恢复</Button>{items.length?<Gallery items={items}/>:<p role='status'>暂无图片</p>}</div>;}
