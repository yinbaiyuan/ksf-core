import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Field} from '@ksf/sdk/field';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FieldNativeExample(){return <Field label='优先级' description='通过渲染函数把 ID 和描述关联给原生控件。'>{control=><select {...control}><option>普通</option><option>优先</option></select>}</Field>;}
