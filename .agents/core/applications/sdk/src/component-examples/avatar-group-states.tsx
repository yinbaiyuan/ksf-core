import {useState} from 'react';
import {AvatarGroup} from '@ksf/sdk/avatar-group';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function AvatarGroupStatesExample(){return <div className='ksf-demo-stack'><AvatarGroup label='两位协作者' items={[{name:'设计',shape:'square'},{name:'开发',shape:'square'}]} size={32}/><AvatarGroup label='全部折叠' items={[{name:'小林'},{name:'小周'}]} max={0}/></div>;}
