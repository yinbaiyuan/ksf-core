// Private CI transport only. Product archives and installed data keep their formats.
import {createReadStream} from 'node:fs';
import {open,rm} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {createHash} from 'node:crypto';
import {createZstdCompress,createZstdDecompress,constants} from 'node:zlib';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// RFC 8878 skippable frame: standard Zstd decoders ignore this metadata.
// Verify the compressed stream independently: some native codec builds accept
// an incomplete frame at EOF. Keep only the 56-byte trailer in memory.
const trailerSize=56,transportTag=Buffer.from('KSFCI001');
function transportIntegrity(operation) {
  const hash=createHash('sha256');let size=0n,tail=Buffer.alloc(0);
  const account=bytes=>{hash.update(bytes);size+=BigInt(bytes.length);};
  return new Transform({
    transform(chunk,encoding,callback){
      if(operation==='compress'){account(chunk);callback(null,chunk);return;}
      const bytes=Buffer.concat([tail,chunk]);
      if(bytes.length>trailerSize){const body=bytes.subarray(0,-trailerSize);account(body);this.push(body);tail=Buffer.from(bytes.subarray(-trailerSize));}
      else tail=bytes;
      callback();
    },
    flush(callback){
      if(operation==='compress'){
        const trailer=Buffer.alloc(trailerSize);trailer.writeUInt32LE(0x184d2a50);trailer.writeUInt32LE(trailerSize-8,4);transportTag.copy(trailer,8);trailer.writeBigUInt64LE(size,16);hash.digest().copy(trailer,24);this.push(trailer);callback();return;
      }
      if(tail.length!==trailerSize||tail.readUInt32LE()!==0x184d2a50||tail.readUInt32LE(4)!==trailerSize-8||!tail.subarray(8,16).equals(transportTag)||tail.readBigUInt64LE(16)!==size||!tail.subarray(24).equals(hash.digest())){
        callback(new Error('Prepared archive is incomplete or its transport digest does not match.'));return;
      }
      callback();
    },
  });
}
export async function transformPreparedArchive(input,output,operation) {
  if (!['compress','decompress'].includes(operation)) throw new Error('Expected compress or decompress.');
  const codec=operation==='compress'?createZstdCompress({params:{
    [constants.ZSTD_c_compressionLevel]:1,[constants.ZSTD_c_checksumFlag]:1,
    [constants.ZSTD_c_windowLog]:27,[constants.ZSTD_c_enableLongDistanceMatching]:1,
  }}):createZstdDecompress();
  const integrity=transportIntegrity(operation);
  let file;
  try { if(output!=='-')file=await open(output,'wx',0o600); }
  catch(error) {codec.destroy();integrity.destroy();throw error;}
  try {await pipeline(input==='-'?process.stdin:createReadStream(input),...(operation==='compress'?[codec,integrity]:[integrity,codec]),file?file.createWriteStream():process.stdout);}
  catch(error) {if(file){await file.close().catch(()=>{});await rm(output,{force:true});}throw error;}
  finally {if(file)await file.close().catch(()=>{});}
}
if (process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  try {
    if (process.argv.length!==5) throw new Error('Usage: prepared-archive.js compress|decompress input|- output|-');
    await transformPreparedArchive(process.argv[3],process.argv[4],process.argv[2]);
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
