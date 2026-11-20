import {useState,useRef} from 'react';
import {TagsInput} from '@ksf/sdk/tags-input';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TagsInputStatesExample(){return <form className='ksf-demo-stack'><TagsInput label='候选多选' name='tags' options={[{value:'design',label:'设计'},{value:'develop',label:'开发'},{value:'review',label:'评审'},{value:'later',label:'暂未开放',disabled:true}]} allowCustom={false} defaultValue={['review']}/><TagsInput label='禁用标签' disabled defaultValue={['归档']}/><Button type='reset'>还原标签</Button></form>;}
