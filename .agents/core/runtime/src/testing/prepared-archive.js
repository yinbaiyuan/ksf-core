// Private CI transport only. Product archives and installed data keep their formats.
import {createReadStream} from 'node:fs';
import {open,rm} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {createZstdCompress,createZstdDecompress,constants} from 'node:zlib';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export async function transformPreparedArchive(input,output,operation) {
  if (!['compress','decompress'].includes(operation)) throw new Error('Expected compress or decompress.');
  const codec=operation==='compress'?createZstdCompress({params:{[constants.ZSTD_c_compressionLevel]:1,[constants.ZSTD_c_checksumFlag]:1}}):createZstdDecompress();
  let file;
  try { file=await open(output,'wx',0o600); }
  catch(error) {codec.destroy();throw error;}
  try {await pipeline(createReadStream(input),codec,file.createWriteStream());}
  catch(error) {await file.close().catch(()=>{});await rm(output,{force:true});throw error;}
  finally {await file.close().catch(()=>{});}
}
if (process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  try {
    if (process.argv.length!==5) throw new Error('Usage: prepared-archive.js compress|decompress input output');
    await transformPreparedArchive(process.argv[3],process.argv[4],process.argv[2]);
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
