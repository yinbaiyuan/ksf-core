import {useState} from 'react';
import {Avatar} from '@ksf/sdk/avatar';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function AvatarBasicExample(){return <div className='ksf-demo-row'><Avatar name='小林' size={24}/><Avatar name='小周' size={32}/><Avatar name='Ksf' size={48}/><Avatar name='工作空间' shape='square' size={40} icon='◫'/></div>;}
