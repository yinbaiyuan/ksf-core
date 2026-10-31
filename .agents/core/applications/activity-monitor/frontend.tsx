import {mountReact,type ApplicationSDK} from '@ksf/sdk/react';
import Monitor from './monitor';
import './style.css';
export function mount(container:HTMLElement,sdk:ApplicationSDK){return mountReact(Monitor,container,sdk);}
