import {useState,useRef,useEffect} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Spinner} from '@ksf/sdk/spinner';
export function SpinnerBasicExample(){return <div className='ksf-demo-row'><Spinner size='small'/><Spinner/><Spinner size='large' label='正在处理'/></div>;}
