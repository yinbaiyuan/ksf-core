import { mountReact, type ApplicationSDK2 } from '@ksf/sdk/react';
import { WorkStatsWidget } from './src/desktop/work-stats';
export function mount(container:HTMLElement,sdk:ApplicationSDK2){return mountReact(WorkStatsWidget,container,sdk);}
