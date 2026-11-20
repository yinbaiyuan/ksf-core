import {useState} from 'react';
import {TeamSeatsView} from '@ksf/sdk/component-examples/team-seats-view';
export default function Example(){const [seats,setSeats]=useState(3);return <TeamSeatsView value={seats} onValueChange={setSeats} min={1} max={12} label="团队席位" pricePerSeat={12} currency="CNY"/>;}
