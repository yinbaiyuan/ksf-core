import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {EmptyState} from '@ksf/sdk/empty-state';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function EmptyStateCompactExample(){return <EmptyState compact description='暂无匹配资料'/>;}
