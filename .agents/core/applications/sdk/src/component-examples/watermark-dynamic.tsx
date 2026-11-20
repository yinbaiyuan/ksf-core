import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Watermark} from '@ksf/sdk/watermark';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function WatermarkDynamicExample(){const [angle,setAngle]=useState(-22);return <div className='ksf-demo-stack'><label>角度 <input type='range' min={-60} max={60} value={angle} onChange={e=>setAngle(e.target.valueAsNumber)}/></label><Watermark content='KSF 评审' angle={angle}><DemoPanel style={{minHeight:180}}>内容随水印设置更新。</DemoPanel></Watermark></div>;}
