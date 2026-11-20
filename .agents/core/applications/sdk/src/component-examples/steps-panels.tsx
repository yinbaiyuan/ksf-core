import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Steps} from '@ksf/sdk/steps';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function StepsPanelsExample(){const [current,setCurrent]=useState(1);return <Steps variant='panel' current={current} onStepSelect={setCurrent} items={[{id:'input',title:'填写资料',description:'补充项目基本信息'},{id:'review',title:'检查内容',description:'核对关键字段'},{id:'done',title:'完成提交',description:'查看处理结果'}]}/>;}
