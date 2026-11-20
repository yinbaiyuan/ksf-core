import {useState,useRef} from 'react';
import {Switch} from '@ksf/sdk/switch';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SwitchStatesExample(){return <form className='ksf-demo-stack'><div className='ksf-demo-row'><Switch label='紧凑开关' size='small' name='enabled' defaultChecked/><span>紧凑开关</span></div><Switch label='禁用开关' disabled defaultChecked/><Button type='reset'>还原开关</Button></form>;}
