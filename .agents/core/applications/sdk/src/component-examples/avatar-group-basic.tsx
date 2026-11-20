import {useState} from 'react';
import {AvatarGroup} from '@ksf/sdk/avatar-group';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function AvatarGroupBasicExample(){return <AvatarGroup label='项目参与者' items={[{name:'小林'},{name:'小周'},{name:'小陈'},{name:'小王'},{name:'小李'}]} max={3} size={40}/>;}
