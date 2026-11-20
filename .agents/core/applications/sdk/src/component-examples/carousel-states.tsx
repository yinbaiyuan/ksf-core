import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Carousel} from '@ksf/sdk/carousel';
export function CarouselStatesExample(){const [index,setIndex]=useState(0);return <div className='ksf-demo-stack'><Carousel label='自动轮播示例' index={index} onIndexChange={setIndex} autoplay interval={4000} effect='fade' slides={mediaSamples.map(item=><img key={item.id} src={item.src} alt={item.alt} style={{width:'100%',height:180,objectFit:'cover',display:'block'}}/>)}/><output>第{index+1}张；悬停、聚焦、窗口失活或减少动态时暂停。</output></div>;}
