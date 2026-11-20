import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TagsInput} from '@ksf/sdk/tags-input';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TagsInputRestrictedExample(){return <TagsInput label='最多两项' options={[{value:'design',label:'设计',description:'界面与交互'},{value:'research',label:'研究',description:'需求与验证'},{value:'build',label:'开发'},{value:'blocked',label:'暂不可用',disabled:true}]} allowCustom={false} maxTags={2} defaultValue={['design']}/>;}
