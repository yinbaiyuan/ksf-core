import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Grid,GridItem} from '@ksf/sdk/grid';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function GridOffsetExample(){return <Grid columns={12} gap={10}><GridItem style={{gridColumn:'3 / span 8'}}><DemoPanel emphasis>从第3列开始，占8列</DemoPanel></GridItem><GridItem style={{gridColumn:'7 / span 6'}}><DemoPanel>从第7列开始，占6列</DemoPanel></GridItem></Grid>;}
