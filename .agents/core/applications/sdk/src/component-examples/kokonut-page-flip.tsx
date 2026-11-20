import {useState} from 'react';
import {PageFlip} from '@ksf/sdk/page-flip';
export default function Example(){const [page,setPage]=useState(0);return <div style={{width:'100%'}}><PageFlip label="春日菜单" page={page} onPageChange={setPage}/><output aria-live="polite">当前页 {page+1}；从纸页角拖动，或使用方向键与翻页按钮。</output></div>;}
