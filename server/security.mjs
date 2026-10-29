import {randomBytes,timingSafeEqual} from 'node:crypto';

const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createAccess(){
  let token=randomBytes(32).toString('hex');const controlToken=randomBytes(32).toString('hex'),session=randomBytes(32).toString('hex');let redeemed=false,expires=Date.now()+10*60*1000;
  return {get token(){return token;},controlToken,
    issue(){token=randomBytes(32).toString('hex');redeemed=false;expires=Date.now()+10*60*1000;return token;},
    redeem(value){if(redeemed||Date.now()>expires||!equal(value,token))return false;redeemed=true;return true;},
    cookie:`hc_session=${session}; HttpOnly; SameSite=Strict; Path=/`,
    authorized(req){const cookie=String(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('hc_session='))?.slice(11);return equal(cookie,session)||equal(String(req.headers.authorization??''),`Bearer ${controlToken}`);},
    requestAllowed(req,origin){
      if(req.headers.host!==new URL(origin).host)return false;
      if(req.headers.origin&&req.headers.origin!==origin)return false;
      if(req.headers['sec-fetch-site']==='cross-site')return false;
      return true;
    }
  };
}
