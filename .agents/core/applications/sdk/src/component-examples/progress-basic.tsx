import {useState,useRef,useEffect} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Progress} from '@ksf/sdk/progress';
export function ProgressBasicExample(){return <div className='ksf-demo-stack'><Progress value={38} active/><Progress value={70} successValue={30}/><Progress value={100} tone='success'/><Progress value={45} tone='error'/><Progress value={60} steps={10}/></div>;}
