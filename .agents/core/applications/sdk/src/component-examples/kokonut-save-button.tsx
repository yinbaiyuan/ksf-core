import {useState} from 'react';
import {CollectionSaveView, type SavedCollection} from '@ksf/sdk/component-examples/collection-save-view';
const initial:SavedCollection[]=[{id:'weekend',name:'周末出行',count:12,color:'bg-orange-400'},{id:'work',name:'设计资料',count:31,color:'bg-sky-400'},{id:'read',name:'稍后阅读',count:7,color:'bg-emerald-400'}];
export default function Example(){const [collections,setCollections]=useState(initial),[saved,setSaved]=useState<string|null>(null);return <CollectionSaveView collections={collections} onCollectionsChange={setCollections} savedCollection={saved} onSavedCollectionChange={setSaved}/>;}
