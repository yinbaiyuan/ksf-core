import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,mkdir,writeFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{loadStoreListing}from'../server/listing.mjs';
test('application icons require a PNG extension and PNG bytes; screenshots retain JPEG',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ksf-icon-standard-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,'store'));const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBncAAAAASUVORK5CYII=','base64'),jpeg=Buffer.from([255,216,255,224,0,0,0,0]);
 const listing=async value=>{await writeFile(join(root,'store/listing.json'),JSON.stringify(value));return loadStoreListing(root);};
 await writeFile(join(root,'store/icon.png'),png);assert.ok((await listing({icon:'icon.png'})).listing.icon);
 await writeFile(join(root,'store/icon.jpg'),png);await assert.rejects(listing({icon:'icon.jpg'}),{code:'APP_LISTING_INVALID'});
 await writeFile(join(root,'store/icon.png'),jpeg);await assert.rejects(listing({icon:'icon.png'}),{code:'APP_LISTING_INVALID'});
 await writeFile(join(root,'store/screen.jpg'),jpeg);assert.equal((await listing({screenshots:[{path:'screen.jpg',alt:'Synthetic screenshot'}]})).media.length,1);
});
