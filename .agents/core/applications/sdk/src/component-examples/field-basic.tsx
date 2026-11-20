import {useState} from 'react';
import {Field} from '@ksf/sdk/field';
import {TextField} from '@ksf/sdk/text-field';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FieldBasicExample(){return <Field label='业务编号' description='自定义原生输入同样有标签与帮助' required>{control=><input {...control} name='code' className='ksf-input ksf-demo-box' required placeholder='KSF-001'/>}</Field>;}
