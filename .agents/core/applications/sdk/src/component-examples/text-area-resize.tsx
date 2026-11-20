import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TextArea} from '@ksf/sdk/text-area';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TextAreaResizeExample(){return <div className='ksf-demo-stack'><TextArea label='可垂直调整' style={{resize:'vertical'}} minRows={3}/><TextArea label='固定高度' style={{resize:'none'}} minRows={3}/></div>;}
