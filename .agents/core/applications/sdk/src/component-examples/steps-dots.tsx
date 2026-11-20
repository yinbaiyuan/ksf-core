import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Steps} from '@ksf/sdk/steps';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function StepsDotsExample(){return <div className='ksf-demo-stack'><Steps variant='dot' current={1} items={[{id:'input',title:'填写资料',description:'补充项目基本信息'},{id:'review',title:'检查内容',description:'核对关键字段'},{id:'done',title:'完成提交',description:'查看处理结果'}]}/><Steps variant='dot' orientation='vertical' current={1} items={[{id:'input',title:'填写资料',description:'补充项目基本信息'},{id:'review',title:'检查内容',description:'核对关键字段'},{id:'done',title:'完成提交',description:'查看处理结果'}]}/></div>;}
