import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Grid,GridItem} from '@ksf/sdk/grid';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function GridNativeStyleExample(){return <Grid columns={2} gap={12} style={{padding:16,border:'1px dashed var(--ksf-color-primary)',borderRadius:12}}><DemoPanel emphasis>自有容器样式</DemoPanel><DemoPanel>原生Grid属性</DemoPanel></Grid>;}
