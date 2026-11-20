import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Carousel} from '@ksf/sdk/carousel';
export function CarouselBasicExample(){return <Carousel label='项目图片' slides={mediaSamples.map(item=><img key={item.id} src={item.src} alt={item.alt} style={{width:'100%',height:180,objectFit:'cover',display:'block'}}/>)}/>;}
