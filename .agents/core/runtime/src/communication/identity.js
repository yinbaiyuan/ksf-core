import {webcrypto,createPublicKey,X509Certificate,randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {X509CertificateGenerator,SubjectAlternativeNameExtension,ExtendedKeyUsageExtension,KeyUsagesExtension,KeyUsageFlags,cryptoProvider} from '../vendor/communication/index.mjs';
import {safeDirectory,readJSON,atomicJSON,sha256,ensure} from './contracts.js';
cryptoProvider.set(webcrypto);
export function certificateIdentity(pem){
 const cert=new X509Certificate(pem),publicKey=cert.publicKey.export({format:'der',type:'spki'});
 return {nodeId:sha256(publicKey),fingerprint:sha256(cert.raw),certificate:cert.toString(),validTo:cert.validTo};
}
export async function loadIdentity(root,{create=false}={}){
 const home=join(root,'.agents/runtime-data/communication/identity'),path=join(home,'device.json');
 const current=await readJSON(path,null);
 if(current){const info=certificateIdentity(current.certificate);ensure(info.nodeId===current.nodeId&&sha256(createPublicKey(current.privateKey).export({format:'der',type:'spki'}))===info.nodeId,'COMM_IDENTITY_INVALID','设备密钥与身份不匹配。');return {...current,...info};}
 if(!create)return null;
 await safeDirectory(root,home);
 const keys=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const subjectId=sha256(Buffer.from(await webcrypto.subtle.exportKey('spki',keys.publicKey)));
 const certificate=await X509CertificateGenerator.createSelfSigned({serialNumber:randomBytes(16).toString('hex'),name:'CN='+subjectId,notBefore:new Date(Date.now()-60000),notAfter:new Date(Date.now()+3*365*86400000),signingAlgorithm:{name:'ECDSA',hash:'SHA-256'},keys,extensions:[new SubjectAlternativeNameExtension([{type:'dns',value:'ksf-peer.local'}]),new ExtendedKeyUsageExtension(['1.3.6.1.5.5.7.3.1','1.3.6.1.5.5.7.3.2']),new KeyUsagesExtension(KeyUsageFlags.digitalSignature)]});
 const key=Buffer.from(await webcrypto.subtle.exportKey('pkcs8',keys.privateKey)).toString('base64').match(/.{1,64}/g).join('\n');
 const info={schemaVersion:1,...certificateIdentity(certificate.toString('pem')),privateKey:`-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----\n`};
 await atomicJSON(path,info);return info;
}
export const publicIdentity=identity=>identity&&({protocol:'ksf-peer-identity-v1',nodeId:identity.nodeId,fingerprint:identity.fingerprint,certificate:identity.certificate,validTo:identity.validTo});
