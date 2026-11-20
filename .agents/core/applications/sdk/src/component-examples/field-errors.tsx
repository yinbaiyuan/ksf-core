import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Field} from '@ksf/sdk/field';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FieldErrorsExample(){const [value,setValue]=useState('');return <Field label='项目代号' error={value.length>0&&value.length<3?'至少输入3个字符':undefined}>{control=><TextField {...control} value={value} onValueChange={setValue}/>}</Field>;}
