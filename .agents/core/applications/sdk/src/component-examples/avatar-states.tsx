import {useState} from 'react';
import {Avatar} from '@ksf/sdk/avatar';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function AvatarStatesExample(){return <div className='ksf-demo-stack'><Avatar name='图片失败后回退' src='data:image/png;base64,invalid' size={48}/><span className='ksf-demo-muted'>图片失败后保留名称与文字替代。</span><Avatar name='名称很长的协作者' size={64}/></div>;}
