import {parentPort} from 'node:worker_threads';
import {PNG} from '../../vendor/icon-codecs/index.mjs';
import {separateIcon, resizeForeground, MAX_PIXELS} from './separate.js';
parentPort.on('message', async ({bytes: input, builtin}) => {
  try {
    const bytes = Buffer.from(input);
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw Error('Image byte limit');
    if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
      parentPort.postMessage({status:'fallback',reason:'png-required'});return;
    }
    const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
    if(width<8||height<8||width>4096||height>4096||width*height>MAX_PIXELS)throw Error('Image dimensions');
    const image=PNG.sync.read(bytes,{checkCRC:true});
    const result = builtin ? {status: 'ready', image, method: 'builtin'} : separateIcon(image);
    if (result.status !== 'ready') { parentPort.postMessage(result); return; }
    const normalized = resizeForeground(result.image), png = PNG.sync.write({...normalized, data: Buffer.from(normalized.data)}, {colorType: 6});
    parentPort.postMessage({status: 'ready', png, background: result.background, method: result.method});
  } catch { parentPort.postMessage({status: 'fallback', reason: 'invalid-image', invalid: true}); }
});
