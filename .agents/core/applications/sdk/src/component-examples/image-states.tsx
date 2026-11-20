import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Image} from '@ksf/sdk/image';
export function ImageStatesExample(){return <div className='ksf-demo-stack'><Image src='data:image/png;base64,broken' fallbackSrc={mediaSamples[1].src} alt='失败后回退图片' width={240} height={140}/><Image src='data:image/png;base64,broken' alt='不可用的图片' width={240} height={100} errorContent='资源暂不可用，请检查地址。'/></div>;}
