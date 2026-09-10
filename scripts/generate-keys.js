import {generateKeyPairSync} from 'node:crypto';
const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const key=privateKey.export({format:'jwk'});
const pub=Buffer.concat([Buffer.from([4]),Buffer.from(key.x,'base64url'),Buffer.from(key.y,'base64url')]).toString('base64url');
console.log('Save these as Worker secrets; never commit the private key.\n');
console.log('VAPID_PUBLIC_KEY='+pub+'\nVAPID_PRIVATE_KEY='+key.d);
