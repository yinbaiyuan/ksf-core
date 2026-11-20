import {Card,CardSummary} from '@ksf/sdk/card';import {Avatar} from '@ksf/sdk/avatar';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CardCoverExample(){return <Card style={{width:320,maxWidth:'100%'}} cover={<img src={mediaSamples[0].src} alt="空间规划"/>} actions={['设计资料','交付记录','更多']}><CardSummary avatar={<Avatar name="小林"/>} title="空间方案" description="小林 · 本轮设计资料与交付记录"/></Card>;}
