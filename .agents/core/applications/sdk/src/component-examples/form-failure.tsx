import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Form,useForm} from '@ksf/sdk/form';import {TextField} from '@ksf/sdk/text-field';import {NumberField} from '@ksf/sdk/number-field';import {Checkbox} from '@ksf/sdk/checkbox';import {Select} from '@ksf/sdk/select';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FormFailureExample(){const [fail,setFail]=useState(true),[result,setResult]=useState('');return <Form onCommit={async(_,ctx)=>{await new Promise(resolve=>setTimeout(resolve,500));if(ctx.signal.aborted)return;if(fail){setFail(false);throw new Error('演示失败');}setResult('重试成功');}} errorMessage='模拟提交失败，请再试一次。'><TextField label='标题' name='title' defaultValue='组件展示'/><Button type='submit'>提交（首次失败）</Button><Button type='reset'>取消</Button><output>{result}</output></Form>;}
