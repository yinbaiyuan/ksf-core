import { mountReact, type ApplicationSDK } from '@ksf/sdk/react';
import { WorkStatsWidget } from './src/desktop/work-stats';
export function mount(container:HTMLElement,sdk:ApplicationSDK){return mountReact(WorkStatsWidget,container,sdk);}
