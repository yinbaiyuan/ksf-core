import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TagsInput} from '@ksf/sdk/tags-input';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TagsInputFormExample(){const [result,setResult]=useState('');return <form onSubmit={e=>{e.preventDefault();setResult(JSON.stringify(new FormData(e.currentTarget).getAll('tags')));}}><TagsInput label='标签' name='tags' options={[{value:'design',label:'设计',description:'界面与交互'},{value:'research',label:'研究',description:'需求与验证'},{value:'build',label:'开发'},{value:'blocked',label:'暂不可用',disabled:true}]} defaultValue={['design','research']}/><Button type='submit'>读取多值</Button><Button type='reset'>重置</Button><output>{result}</output></form>;}
