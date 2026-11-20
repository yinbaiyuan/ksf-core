import type {ComponentType} from 'react';
import {mountReact as mountApplication,useApplicationSDK} from '@ksf/sdk/react';
import type {ApplicationSDK} from '@ksf/sdk';
import {SDKUIProvider} from './mount';
export {useApplicationSDK};
export type {ApplicationSDK};
export function mountReact(Component:ComponentType<any>,container:HTMLElement,sdk:ApplicationSDK){return mountApplication((props:any)=><SDKUIProvider sdk={sdk}><Component {...props} sdk={sdk}/></SDKUIProvider>,container,sdk);}
