import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Grid,GridItem} from '@ksf/sdk/grid';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function GridFlexFillExample(){return <Grid columns='72px minmax(0,1fr) auto' gap={8}><DemoPanel emphasis>固定72</DemoPanel><DemoPanel>剩余宽度</DemoPanel><DemoPanel emphasis style={{paddingInline:8}}>自动</DemoPanel></Grid>;}
