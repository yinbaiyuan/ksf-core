import {mountReact} from '@ksf/sdk/react';
import type {ApplicationSDK} from '@ksf/sdk/react';
import Reader from './reader';
import './reader.css';
export function mount(container:HTMLElement,sdk:ApplicationSDK){return mountReact(Reader,container,sdk);}
