import { mountReact, type ApplicationSDK } from '@ksf/sdk/react';
import { ReviewWorkbench } from './src/review';
export function mount(container:HTMLElement,sdk:ApplicationSDK){return mountReact(ReviewWorkbench,container,sdk);}
