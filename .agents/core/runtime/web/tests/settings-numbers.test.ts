import test from 'node:test';
import assert from 'node:assert/strict';
import {configurationNumber} from '../src/desktop/settings-numbers.ts';
test('configuration numeric drafts are checked at submit without converting partial input to zero',()=>{
 for(const value of ['',' ','-','+','.','1e','1e-','NaN','Infinity','1,000','1e999'])assert.throws(()=>configurationNumber(value,'端口',1,65535),value);
 assert.equal(configurationNumber(' 45731 ','端口',1,65535),45731);
 assert.equal(configurationNumber('1.','次数',1,5),1);
 assert.equal(configurationNumber('1e3','时限',1,3600),1000);
});
test('port, attempts, and storage limits reject out of range or fractional integers',()=>{
 for(const value of ['0','65536','2.5'])assert.throws(()=>configurationNumber(value,'端口',1,65535));
 assert.throws(()=>configurationNumber('6','最多尝试',1,5));
 assert.throws(()=>configurationNumber('9007199254740992','字节',1));
 assert.equal(configurationNumber('1.25','MiB',1,16384,false),1.25);
 assert.throws(()=>configurationNumber('0.9','临时接收额度',1.25,16384,false));
});
