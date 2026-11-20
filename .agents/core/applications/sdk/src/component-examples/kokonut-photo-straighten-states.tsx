import {PhotoStraighten} from '@ksf/sdk/photo-straighten';
import {landscapeImage} from '@ksf/sdk/component-examples/demo-media';

export default function Example(){return <PhotoStraighten label="只读校正图" src={landscapeImage} alt="本地原创场景图" angle={3} disabled/>;}
