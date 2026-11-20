import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ErrorSummary} from '@ksf/sdk/error-summary';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ErrorSummaryCustomExample(){const [target,setTarget]=useState('');return <div className='ksf-demo-stack'><ErrorSummary title='两处资料待补充' errors={[{id:'scope',message:'补充范围'},{id:'date',message:'补充日期'}]} onNavigate={setTarget}/><output>应用接到的定位目标：{target||'暂无'}</output></div>;}
