import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Popover} from '@ksf/sdk/popover';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PopoverFormExample(){const [value,setValue]=useState('');return <Popover trigger="click" label='快速编辑' heading='编辑标签' content={<div className='ksf-demo-stack'><TextField label='标签' value={value} onValueChange={setValue}/><output>{value}</output></div>}><Button>编辑</Button></Popover>;}
