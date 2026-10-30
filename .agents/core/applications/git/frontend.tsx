import './src/business.css';
import { mountReact, type ApplicationSDK } from '@ksf/sdk/react';
import { GitApp } from './src/apps/git';
export function mount(container:HTMLElement,sdk:ApplicationSDK){return mountReact(GitApp,container,sdk);}
