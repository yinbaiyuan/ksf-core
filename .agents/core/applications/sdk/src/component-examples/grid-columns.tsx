import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Grid,GridItem} from '@ksf/sdk/grid';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function GridColumnsExample(){return <Grid columns={12} gap={8}>{[12,6,6,4,4,4,3,3,3,3].map((span,i)=><GridItem columnSpan={span} key={i}><DemoPanel emphasis style={{padding:10,textAlign:'center'}}>span {span}</DemoPanel></GridItem>)}</Grid>;}
