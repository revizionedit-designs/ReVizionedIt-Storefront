'use strict';
// Node 24+. No payment credentials or uploaded photos are served to the browser.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const M=require('./public/order-model.js');
const root=path.resolve(__dirname,'public'),privateDir=path.resolve(process.env.ORDER_DATA_DIR||path.join(__dirname,'private'));
fs.mkdirSync(privateDir,{recursive:true,mode:0o700});
const db=new DatabaseSync(path.join(privateDir,'orders.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, request_key TEXT UNIQUE, request_hash TEXT, token_hash TEXT UNIQUE, payload TEXT, square_request TEXT, square_order TEXT, payment_url TEXT, amount INTEGER, status TEXT, created_at TEXT, payment_id TEXT);`);
let settings={enabled:false,rules:{}};try{settings=JSON.parse(fs.readFileSync(path.join(__dirname,'checkout-config.json'),'utf8'));}catch{}
const origin=process.env.PUBLIC_ORIGIN||'',squareMode=process.env.SQUARE_ENVIRONMENT||'sandbox';
const ready=!!(settings.enabled&&process.env.OWNER_PASSWORD?.length>=20&&process.env.SQUARE_ACCESS_TOKEN&&process.env.SQUARE_LOCATION_ID&&process.env.SQUARE_WEBHOOK_SIGNATURE_KEY&&/^https:\/\//.test(origin)&&process.env.SQUARE_WEBHOOK_URL===origin+'/api/square-webhook');
const squareBase=squareMode==='production'?'https://connect.squareup.com':'https://connect.squareupsandbox.com';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const money=amount=>({amount,currency:'USD'});
function send(res,code,data){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req,limit=18*1024*1024){let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>limit){const e=Error('Your upload is too large. Choose smaller photos.');e.status=413;throw e;}parts.push(chunk);}return Buffer.concat(parts);}
async function square(route,method='GET',data){const r=await fetch(squareBase+route,{method,headers:{Authorization:'Bearer '+process.env.SQUARE_ACCESS_TOKEN,'Square-Version':'2026-01-22','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(25000)});const result=await r.json();if(!r.ok){console.error('Square request failed:',r.status,result.errors?.map(x=>x.code).join(','));throw Error('Payment setup could not be completed. Your payment has not been taken. Please try again.');}return result;}
function cleanPhotos(photos){return photos.map((p,i)=>{
 if(!p||typeof p.name!=='string'||p.name.length>255||typeof p.data!=='string')throw Error('Invalid photo.');
 const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(p.data);if(!match)throw Error('Use JPG, PNG, or WebP photos.');
 const bytes=Buffer.from(match[2],'base64');if(bytes.length>3*1024*1024||bytes.length<12)throw Error('Each photo must be under 3 MB.');
 const valid=(match[1]==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)||(match[1]==='image/png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||(match[1]==='image/webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP');
 if(!valid)throw Error('A photo could not be verified. Please choose another file.');
 return {name:p.name,filename:`photo-${i+1}.${match[1].split('/')[1]}`,type:match[1],bytes};
 });}
function taxFor(order){const key=order.fulfillment==='shipping'?`shipping:${order.address.state}:${order.address.zip.slice(0,5)}`:`pickup:${order.fulfillment}`;const rule=settings.rules?.[key];if(!rule||!Number.isFinite(rule.percentage)||rule.percentage<0||rule.percentage>20||typeof rule.shippingTaxable!=='boolean'||typeof rule.rushTaxable!=='boolean')throw Error('Online checkout is not available for this delivery location yet. Please contact Orders@revizioneditdesigns.com.');return rule;}
function makeSquareRequest(id,token,order,q,rule){
 const tax=rule.percentage>0?[{uid:'sales-tax',name:'Sales tax',percentage:String(rule.percentage),scope:'LINE_ITEM',type:'ADDITIVE'}]:[];
 const entry=(name,quantity,amount,note,taxable=true)=>({name,quantity:String(quantity),base_price_money:money(amount),note:note||undefined,...(tax.length&&taxable?{applied_taxes:[{tax_uid:'sales-tax'}]}:{})});
 const lines=q.lines.map(x=>entry(x.name,x.quantity,x.unit,x.detail));q.addons.forEach(x=>lines.push(entry('Add-on: '+x.name,x.quantity,x.unit)));
 if(q.rush)lines.push(entry('Rush fee',1,q.rush,'Event under 14 days away',rule.rushTaxable));
 if(q.shipping)lines.push(entry('Flat-rate shipping',1,q.shipping,undefined,rule.shippingTaxable));
 const note=`Order ${id}; event ${order.event.date}; ${order.event.name}; ${order.event.theme}; ${order.fulfillment}. Full design details and photos are stored with this order.`;
 const result={idempotency_key:id,description:'ReVizionedIt Designs '+id,order:{location_id:process.env.SQUARE_LOCATION_ID,reference_id:id,line_items:lines,taxes:tax,metadata:{design_order:id,event_date:order.event.date,fulfillment:order.fulfillment}},checkout_options:{allow_tipping:false,ask_for_shipping_address:false,merchant_support_email:'Orders@revizioneditdesigns.com',redirect_url:origin+'/?order='+token},pre_populated_data:{buyer_email:order.contact.email},payment_note:note.slice(0,500)};
 // Delivery address is collected and stored in the branded flow, not recollected at payment.
 // This also prevents changing the tax destination after the quote is calculated.
 return result;
}
const locks=new Map(),rates=new Map();
function limited(ip){const now=Date.now();let bucket=rates.get(ip);if(!bucket||now-bucket.start>600000)bucket={start:now,count:0};bucket.count++;rates.set(ip,bucket);if(rates.size>10000)for(const [k,v]of rates)if(now-v.start>600000)rates.delete(k);return bucket.count>25;}
async function checkout(req,res,raw){
 if(!ready)return send(res,503,{error:'Checkout is not open yet. No order has been submitted or charged.'});
 if(req.headers.origin!==origin)return send(res,403,{error:'Open checkout from the storefront.'});
 if(limited(req.socket.remoteAddress))return send(res,429,{error:'Too many attempts. Please wait a few minutes.'});
 const key=req.headers['idempotency-key'];if(typeof key!=='string'||!/^[A-Za-z0-9-]{16,80}$/.test(key))return send(res,400,{error:'Please reload the storefront and try again.'});
 if(locks.has(key)){await locks.get(key);return checkout(req,res,raw);}
 let unlock;locks.set(key,new Promise(r=>unlock=r));
 try{
 const digest=hash(raw);let saved=db.prepare('SELECT * FROM orders WHERE request_key=?').get(key);
 if(saved&&saved.request_hash!==digest)return send(res,409,{error:'Your order changed. Please start a new checkout.'});
 if(saved?.payment_url)return send(res,200,{url:saved.payment_url});
 if(!saved){
 const order=JSON.parse(raw),q=M.validate(order),photos=cleanPhotos(order.photos),rule=taxFor(order);
 const id=crypto.randomUUID(),token=crypto.randomBytes(32).toString('hex');
 const request=makeSquareRequest(id,token,order,q,rule);
 const dir=path.join(privateDir,id);fs.mkdirSync(dir,{mode:0o700});photos.forEach(p=>fs.writeFileSync(path.join(dir,p.filename),p.bytes,{mode:0o600}));
 const safe={...order,photos:photos.map(({name,filename,type})=>({name,filename,type})),quote:q};
 db.prepare('INSERT INTO orders (id,request_key,request_hash,token_hash,payload,square_request,status,created_at) VALUES (?,?,?,?,?,?,?,?)').run(id,key,digest,hash(token),JSON.stringify(safe),JSON.stringify(request),'pending',new Date().toISOString());
 saved=db.prepare('SELECT * FROM orders WHERE id=?').get(id);
 }
 const response=await square('/v2/online-checkout/payment-links','POST',JSON.parse(saved.square_request));
 const link=response.payment_link;if(!link?.url||!link.order_id)throw Error('Square did not return a payment link. Please try again.');
 const sqOrder=(response.related_resources?.orders||[]).find(x=>x.id===link.order_id)||(await square('/v2/orders/'+encodeURIComponent(link.order_id))).order;
 if(!sqOrder?.total_money||sqOrder.total_money.currency!=='USD')throw Error('The payment total could not be verified. Please contact us.');
 db.prepare('UPDATE orders SET square_order=?,payment_url=?,amount=? WHERE id=?').run(link.order_id,link.url,sqOrder.total_money.amount,saved.id);
 send(res,200,{url:link.url});
 }finally{unlock();locks.delete(key);}
}
function paymentVerified(payment,order){return payment&&payment.status==='COMPLETED'&&payment.order_id===order.square_order&&payment.amount_money?.currency==='USD'&&payment.amount_money.amount===order.amount&&payment.location_id===process.env.SQUARE_LOCATION_ID;}
async function webhook(req,res,raw){
 const key=process.env.SQUARE_WEBHOOK_SIGNATURE_KEY,url=process.env.SQUARE_WEBHOOK_URL,sig=req.headers['x-square-hmacsha256-signature'];if(!key||!url||typeof sig!=='string')return send(res,403,{error:'Invalid signature'});
 const expected=crypto.createHmac('sha256',key).update(url).update(raw).digest(),received=Buffer.from(sig,'base64');if(received.length!==expected.length||!crypto.timingSafeEqual(expected,received))return send(res,403,{error:'Invalid signature'});
 const event=JSON.parse(raw);if(['payment.created','payment.updated'].includes(event.type)){
 const p=event.data?.object?.payment,order=p?.order_id&&db.prepare('SELECT * FROM orders WHERE square_order=?').get(p.order_id);
 if(order&&paymentVerified(p,order))db.prepare("UPDATE orders SET status='paid',payment_id=? WHERE id=?").run(p.id,order.id);
 }send(res,200,{received:true});
}
function ownerAllowed(req){
 const password=process.env.OWNER_PASSWORD;if(!password||password.length<20)return false;
 const given=String(req.headers.authorization||'');const expected='Basic '+Buffer.from('owner:'+password).toString('base64');
 if(crypto.timingSafeEqual(Buffer.from(hash(given)),Buffer.from(hash(expected))))return true;
 const cookie=/^rv_owner=(\d{13})\.([a-f0-9]{64})$/.exec((req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('rv_owner='))||'');
 if(!cookie)return false;
 const issued=Number(cookie[1]);if(issued>Date.now()||Date.now()-issued>12*60*60*1000)return false;
 const expectedCookie=crypto.createHmac('sha256',password).update('owner-session-v1:'+cookie[1]).digest('hex');
 return crypto.timingSafeEqual(Buffer.from(cookie[2]),Buffer.from(expectedCookie));
}
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function ownerPage(content){return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ReVizionedIt orders</title><style>body{font:16px/1.5 Arial;background:#171116;color:#fff;margin:0;padding:32px}main{max-width:1100px;margin:auto}h1,h2,a{color:#ff91c6}article{border:1px solid #ff72b8;padding:24px;border-radius:16px;margin:20px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}img{max-width:180px;max-height:180px;margin:10px;border-radius:12px}table{width:100%;border-collapse:collapse}td,th{text-align:left;border-bottom:1px solid #73445f;padding:12px}small{color:#dec7d3}</style><main>'+content+'</main></html>';}
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg'};
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
 try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/owner/login'){
  if(req.method==='POST'){
   const raw=await body(req,4096),form=new URLSearchParams(raw.toString('utf8'));
   const candidate=String(form.get('password')||''),secret=process.env.OWNER_PASSWORD||'';
   const good=secret.length>=20&&crypto.timingSafeEqual(Buffer.from(hash(candidate)),Buffer.from(hash(secret)));
   if(!good){res.writeHead(303,{Location:'/owner/login?error=1','Cache-Control':'no-store'});return res.end();}
   const issued=String(Date.now()),token=crypto.createHmac('sha256',secret).update('owner-session-v1:'+issued).digest('hex');
   res.writeHead(303,{Location:'/owner','Set-Cookie':`rv_owner=${issued}.${token}; Max-Age=43200; HttpOnly; Secure; SameSite=Strict; Path=/owner`,'Cache-Control':'no-store'});return res.end();
  }
  if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});
  const error=url.searchParams.has('error')?'<p role="alert">Password did not match. Copy the OWNER_PASSWORD value from Render and try again.</p>':'';
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"});
  return res.end(ownerPage('<h1>Owner sign in</h1>'+error+'<form action="/owner/login" method="post"><label>Password <input type="password" name="password" autocomplete="current-password" required></label> <button type="submit">Sign in</button></form>'));
 }
 if(url.pathname==='/owner'||url.pathname.startsWith('/owner/')){
  if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});
  if(!ownerAllowed(req)){res.writeHead(303,{Location:'/owner/login','Cache-Control':'no-store'});return res.end();}
  const parts=url.pathname.split('/').filter(Boolean);let html;
  if(parts.length===1){
   const orders=db.prepare('SELECT id,status,created_at,amount,payload FROM orders ORDER BY created_at DESC LIMIT 200').all();
   html=ownerPage('<h1>Your orders</h1><p>Only “paid” orders have verified Square payments. Pending orders may be abandoned checkouts.</p><table><thead><tr><th>Customer</th><th>Event</th><th>Payment</th><th>Order</th></tr></thead><tbody>'+orders.map(o=>{const p=JSON.parse(o.payload);return '<tr><td>'+escape(p.contact.name)+'</td><td>'+escape(p.event.date)+'</td><td>'+escape(o.status)+(o.amount?' · '+M.money(o.amount):'')+'</td><td><a href="/owner/'+encodeURIComponent(o.id)+'">View details & photos</a></td></tr>';}).join('')+'</tbody></table>');
  }else{
   const order=db.prepare('SELECT * FROM orders WHERE id=?').get(parts[1]);if(!order)return send(res,404,{error:'Not found'});const payload=JSON.parse(order.payload);
   if(parts.length===3){const photo=payload.photos.find(p=>p.filename===parts[2]);if(!photo)return send(res,404,{error:'Not found'});res.writeHead(200,{'Content-Type':photo.type,'Cache-Control':'no-store'});return fs.createReadStream(path.join(privateDir,order.id,photo.filename)).pipe(res);}
   html=ownerPage('<a href="/owner">← All orders</a><h1>'+escape(payload.contact.name)+'</h1><p>Payment: <strong>'+escape(order.status)+'</strong></p><p>Reference: '+escape(order.id)+'</p><p>Square order: '+escape(order.square_order||'Not created yet')+'</p><article><h2>Event, items & delivery</h2><pre>'+escape(JSON.stringify({...payload,photos:undefined},null,2))+'</pre></article><article><h2>Photos</h2>'+payload.photos.map(p=>'<a href="/owner/'+encodeURIComponent(order.id)+'/'+encodeURIComponent(p.filename)+'" target="_blank" rel="noopener"><img src="/owner/'+encodeURIComponent(order.id)+'/'+encodeURIComponent(p.filename)+'" alt="'+escape(p.name)+'"></a>').join('')+'</article>');
  }
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'"});return res.end(html);
 }
 if(req.method==='GET'&&url.pathname==='/api/config')return send(res,200,{checkoutReady:ready,environment:squareMode});
 if(req.method==='POST'&&url.pathname==='/api/checkout')return await checkout(req,res,await body(req));
 if(req.method==='POST'&&url.pathname==='/api/square-webhook')return await webhook(req,res,await body(req,1024*1024));
 if(req.method==='GET'&&url.pathname==='/api/order-status'){
 const token=url.searchParams.get('token');if(!/^[a-f0-9]{64}$/.test(token||''))return send(res,404,{status:'unknown'});
 const order=db.prepare('SELECT * FROM orders WHERE token_hash=?').get(hash(token));if(!order)return send(res,404,{status:'unknown'});
 if(order.status!=='paid'&&order.square_order&&ready){
 try{const data=await square('/v2/orders/'+encodeURIComponent(order.square_order));for(const tender of data.order?.tenders||[]){if(tender.payment_id){const {payment}=await square('/v2/payments/'+encodeURIComponent(tender.payment_id));if(paymentVerified(payment,order)){db.prepare("UPDATE orders SET status='paid',payment_id=? WHERE id=?").run(payment.id,order.id);order.status='paid';break;}}}}catch{}
 }return send(res,200,{status:order.status==='paid'?'paid':'pending'});
 }
 if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{error:'Method not allowed'});
 if(url.pathname.startsWith('/api/'))return send(res,404,{error:'Not found'});
 const target=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!target.startsWith(root+path.sep))return send(res,404,{error:'Not found'});
 if(!fs.existsSync(target)||!fs.statSync(target).isFile())return send(res,404,{error:'Not found'});
 res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':url.pathname.startsWith('/assets/')?'public, max-age=86400':'no-cache'});if(req.method==='HEAD')res.end();else fs.createReadStream(target).pipe(res);
 }catch(e){console.error('Request failed:',e.message);send(res,e.status||400,{error:e instanceof SyntaxError?'The order could not be read. Please try again.':e.message||'Please try again.'});}
});
if(require.main===module)server.listen(Number(process.env.PORT||8787),process.env.HOST||'0.0.0.0',()=>console.log('Storefront listening on port '+(process.env.PORT||8787)));
module.exports={server,makeSquareRequest,paymentVerified,cleanPhotos};
