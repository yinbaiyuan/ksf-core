import {BackgroundEffect} from '@ksf/sdk/background-effect';

export default function Example(){return <BackgroundEffect label="静态线条背景" mode="paths" paused interactive={false}><h2>内容优先</h2><p>减少动态或显式暂停时，保留静态视觉。</p></BackgroundEffect>;}
