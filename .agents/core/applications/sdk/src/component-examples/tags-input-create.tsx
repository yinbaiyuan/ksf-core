import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TagsInput} from '@ksf/sdk/tags-input';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TagsInputCreateExample(){return <TagsInput label='任务标签' options={[{value:'design',label:'设计',description:'界面与交互'},{value:'research',label:'研究',description:'需求与验证'},{value:'build',label:'开发'},{value:'blocked',label:'暂不可用',disabled:true}]} defaultValue={['design','中文自定义']} description='输入后按 Enter 创建；重复值不会添加；空输入按退格删除末项。'/>;}
