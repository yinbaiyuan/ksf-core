import { mountReact, type ApplicationSDK2 } from '@ksf/sdk/react';
import { ConversationApp } from './src/app';
export function mount(container:HTMLElement,sdk:ApplicationSDK2){return mountReact(ConversationApp,container,sdk);}
