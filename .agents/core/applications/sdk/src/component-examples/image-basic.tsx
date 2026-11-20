import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Image} from '@ksf/sdk/image';
export function ImageBasicExample(){return <Image src={mediaSamples[0].src} alt='空间规划示意图' width={260} height={160} preview/>;}
