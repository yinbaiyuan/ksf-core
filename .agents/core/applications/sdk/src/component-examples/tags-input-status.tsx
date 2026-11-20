import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TagsInput} from '@ksf/sdk/tags-input';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TagsInputStatusExample(){return <div className='ksf-demo-stack'><TagsInput label="warning" options={[{value:'design',label:'设计',description:'界面与交互'},{value:'research',label:'研究',description:'需求与验证'},{value:'build',label:'开发'},{value:'blocked',label:'暂不可用',disabled:true}]} status="warning" /><TagsInput label="error" options={[{value:'design',label:'设计',description:'界面与交互'},{value:'research',label:'研究',description:'需求与验证'},{value:'build',label:'开发'},{value:'blocked',label:'暂不可用',disabled:true}]} status="error" /></div>;}
