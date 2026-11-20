import {useState} from 'react';
import {Fieldset} from '@ksf/sdk/fieldset';
import {TextField} from '@ksf/sdk/text-field';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FieldsetBasicExample(){return <Fieldset legend='联系信息' description='把相关字段放在同一原生fieldset中。'><TextField label='联系人' name='contact'/><TextField label='邮箱' name='email' type='email'/></Fieldset>;}
