import './src/business.css';
import { mountReact, type ApplicationSDK2 } from '@ksf/sdk/react';
import { GitApp } from './src/apps/git';
export function mount(container:HTMLElement,sdk:ApplicationSDK2){return mountReact(GitApp,container,sdk);}
