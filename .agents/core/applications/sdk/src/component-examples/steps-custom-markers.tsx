import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Steps} from '@ksf/sdk/steps';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function StepsCustomMarkersExample(){return <Steps current={1} size='small' renderMarker={(item,index,state)=><span style={{fontSize:12}}>{state==='finish'?'✓':String.fromCharCode(65+index)}</span>} items={[{id:'input',title:'填写资料',description:'补充项目基本信息'},{id:'review',title:'检查内容',description:'核对关键字段'},{id:'done',title:'完成提交',description:'查看处理结果'}]}/>;}
