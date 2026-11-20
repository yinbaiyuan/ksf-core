import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Field} from '@ksf/sdk/field';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FieldRequiredExample(){return <Field label='项目名称' required description='名称将出现在工作区列表。'>{control=><TextField {...control} name='project' required/>}</Field>;}
