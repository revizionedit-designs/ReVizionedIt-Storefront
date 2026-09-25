(()=>{
'use strict';
const M=OrderModel,$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={lines:[],addons:{},photos:[],event:{},contact:{},address:{},fulfillment:'springfield',accepted:false};
let step=0,ready=false,pending=false,requestKey=null,opener=null;
const uid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
function error(message){$('#order-error').textContent=message;$('#order-error').hidden=!message;if(message)$('#order-error').scrollIntoView({behavior:'smooth',block:'center'});}
function dirty(){requestKey=null;}
function readDetails(){
 state.event={date:$('#event-date').value,name:$('#event-name').value.trim(),age:$('#event-age').value.trim(),zodiac:$('#event-zodiac').value,colors:$('#event-colors').value.trim(),theme:$('#event-theme').value.trim(),notes:$('#event-notes').value.trim()};
 state.contact={name:$('#contact-name').value.trim(),email:$('#contact-email').value.trim(),phone:$('#contact-phone').value.trim()};
 state.fulfillment=$('input[name=fulfillment]:checked').value;
 state.address={line1:$('#address-line1').value.trim(),line2:$('#address-line2').value.trim(),city:$('#address-city').value.trim(),state:$('#address-state').value,zip:$('#address-zip').value.trim()};
 state.accepted=$('#policy-accept').checked;
}
function selectedLine(){return {id:uid(),product:$('#product').value,quantity:Number($('#set-quantity').value),size:Number($('#set-size')?.value),cupType:$('#cup-type')?.value,choice:$('#close-choice')?.value,picks:$$('[name=favor-pick]:checked').map(x=>x.value)};}
function selectionPrice(){try{$('#selection-price').textContent=M.money(M.priceLine(selectedLine()).total);}catch{$('#selection-price').textContent=$('#product').value==='custom'?'Pick your favors':'—';}}
function selectProduct(id){$('#product').value=id;const p=M.catalog[id];$('#product-description').textContent=p.description;let html='';
 if(p.prices)html+='<label for="set-size">Pieces per set</label><select id="set-size">'+Object.entries(p.prices).map(([n,price])=>`<option value="${n}">${n} pieces · ${M.money(price)}</option>`).join('')+'</select>';
 if(id==='cups')html+='<label for="cup-type" style="margin-top:16px">Cup style</label><select id="cup-type"><option>Foam</option><option>Plastic</option></select>';
 if(id==='close')html+='<label for="close-choice">Choose your included favor</label><select id="close-choice"><option>Party hats</option><option>Fans</option></select>';
 if(id==='custom')html+='<p class="order-muted">Select up to 10 types. Each pick adds $60.</p><div class="order-choice-grid">'+M.picks.map(x=>`<label><input type="checkbox" name="favor-pick" value="${esc(x)}">${esc(x)}</label>`).join('')+'</div>';
 $('#product-options').innerHTML=html;$('#set-quantity').value=1;selectionPrice();
}
function renderBag(){readDetails();let q;try{q=M.quote(state);}catch(e){if(state.event.date){try{q=M.quote({...state,event:{}});}catch{}}}
 $('#bag-items').innerHTML=state.lines.length?state.lines.map((line,i)=>{const p=M.priceLine(line);return `<div class="bag-item"><strong>${esc(p.name)} × ${p.quantity}</strong><p>${esc(p.detail||M.catalog[line.product].description)}</p><div class="bag-row"><span>${M.money(p.total)}</span><button type="button" class="order-text-button" data-remove="${i}" aria-label="Remove ${esc(p.name)}">Remove</button></div></div>`;}).join(''):'<p class="order-muted">Your next celebration starts here. Add your first favorite.</p>';
 if(q){$('#bag-totals').innerHTML=q.addons.map(x=>`<div class="bag-row"><span>${esc(x.name)} × ${x.quantity}</span><span>${M.money(x.total)}</span></div>`).join('')+`<div class="bag-row"><span>Items</span><span>${M.money(q.subtotal)}</span></div><div class="bag-row"><span>${state.fulfillment==='shipping'?'Shipping':'Pickup'}</span><span>${M.money(q.shipping)}</span></div>`+(q.rush?`<div class="bag-row"><span>Rush fee</span><span>${M.money(q.rush)}</span></div>`:'')+`<div class="bag-row bag-total"><span>Before tax</span><span>${M.money(q.total)}</span></div>`;}else $('#bag-totals').innerHTML='';
 const hasPackage=state.lines.some(x=>M.catalog[x.product].package);
 $$('#addon-inputs input').forEach(x=>{x.disabled=!hasPackage;if(!hasPackage){x.value=0;state.addons[x.dataset.addon]=0;}});
 if(state.event.date){try{$('#rush-note').hidden=!(M.daysUntil(state.event.date)<14&&M.daysUntil(state.event.date)>0);}catch{$('#rush-note').hidden=true;}}
}
function detailsValid(){readDetails();if(!$('#step-1').reportValidity())return false;try{M.validate({...state,accepted:true});return true;}catch(e){error(e.message);return false;}}
function showStep(next){error('');if(next>0&&!state.lines.length){error('Add at least one item to your order.');return;}if(next===2){for(let i=0;i<3;i++)$('#step-'+i).hidden=i!==1;if(!detailsValid())next=1;}
 step=next;for(let i=0;i<3;i++)$('#step-'+i).hidden=i!==step;
 $$('[data-step]').forEach(x=>{if(Number(x.dataset.step)===step)x.setAttribute('aria-current','step');else x.removeAttribute('aria-current');});
 renderBag();if(step===2)renderReview();$('#builder-title').focus({preventScroll:true});$('#build').scrollIntoView({behavior:'smooth',block:'start'});
}
function open(id,source){opener=source||opener;$('#top').hidden=true;$('#build').hidden=false;if(id&&M.catalog[id])selectProduct(id);showStep(0);if(id==='addons')$('#addons-section').scrollIntoView({behavior:'smooth',block:'start'});}
function close(){if(pending)return;$('#top').hidden=false;$('#build').hidden=true;history.replaceState(null,'',location.pathname+location.search+'#shop');opener?.focus();$('#shop').scrollIntoView({behavior:'smooth'});}
function renderReview(){readDetails();const e=state.event,c=state.contact,delivery=state.fulfillment==='shipping'?['US shipping',state.address.line1,state.address.line2,`${state.address.city}, ${state.address.state} ${state.address.zip}`].filter(Boolean).join('\n'):state.fulfillment==='chicago'?'Chicago, Illinois pickup':'Springfield, Illinois pickup';
 const entry=(label,value)=>value?`<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`:'';
 $('#review-details').innerHTML=`<div class="review-group"><h3>Your event</h3><dl>${entry('Date',e.date)}${entry('Name / wording',e.name)}${entry('Age / milestone',e.age)}${entry('Zodiac',e.zodiac)}${entry('Theme',e.theme)}${entry('Colors',e.colors)}${entry('Instructions',e.notes)}</dl></div><div class="review-group"><h3>Contact & delivery</h3><p>${esc(c.name)}\n${esc(c.email)}\n${esc(c.phone)}</p><p>${esc(delivery)}</p></div><div class="review-group"><h3>Photos</h3><p>${state.photos.length?state.photos.map(x=>esc(x.name)).join('<br>'):'No photos selected.'}</p></div>`;
}
function setDelivery(){const shipping=$('input[name=fulfillment]:checked').value==='shipping';$('#address-fields').hidden=!shipping;$('#pickup-note').hidden=shipping;['line1','city','state','zip'].forEach(x=>$('#address-'+x).required=shipping);dirty();renderBag();}
function photos(){const el=$('#photo-previews');el.innerHTML='';state.photos.forEach((photo,i)=>{const box=document.createElement('div');box.className='order-photo';const img=document.createElement('img');img.src=photo.data;img.alt=photo.name;const button=document.createElement('button');button.type='button';button.textContent='Remove';button.setAttribute('aria-label','Remove '+photo.name);button.onclick=()=>{state.photos.splice(i,1);dirty();photos();};box.append(img,button);el.append(box);});}
$('#product').innerHTML=Object.entries(M.catalog).map(([id,p])=>`<option value="${id}">${esc(p.name)}</option>`).join('');
$('#addon-inputs').innerHTML=Object.entries(M.addons).map(([id,p])=>`<div class="order-addon"><label for="addon-${id}">${esc(p.name)}<span>${M.money(p.price)} each</span></label><input id="addon-${id}" data-addon="${id}" type="number" value="0" min="0" max="100" disabled aria-label="${esc(p.name)} quantity"></div>`).join('');
$('#address-state').insertAdjacentHTML('beforeend','AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ').map(x=>`<option>${x}</option>`).join(''));
const tomorrow=new Date(M.dayInChicago()+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);$('#event-date').min=tomorrow.toISOString().slice(0,10);
selectProduct('basic');renderBag();
$$('[data-product],[data-order-open]').forEach(x=>x.addEventListener('click',ev=>{ev.preventDefault();open(x.dataset.product,x);}));
$('#back-store').onclick=close;
$$('header a[href="#top"],header a[href="#shop"],header a[href="#how"],header a[href="#policies"]').forEach(a=>a.addEventListener('click',()=>{if(pending)return;$('#top').hidden=false;$('#build').hidden=true;}));
$('#product').onchange=()=>selectProduct($('#product').value);
$('#product-options').onchange=()=>{if($$('[name=favor-pick]:checked').length>10){error('Choose up to 10 favor types.');}else error('');selectionPrice();};
$('#set-quantity').oninput=selectionPrice;
$('#add-item').onclick=()=>{try{const line=selectedLine();M.priceLine(line);state.lines.push(line);dirty();error('');renderBag();$('#add-item').textContent='Added to your order ✓';setTimeout(()=>$('#add-item').textContent='Add to my order',1400);}catch(e){error(e.message);}};
$('#bag-items').onclick=ev=>{const b=ev.target.closest('[data-remove]');if(!b||pending)return;state.lines.splice(Number(b.dataset.remove),1);if(!state.lines.some(x=>M.catalog[x.product].package))state.addons={};dirty();renderBag();if(step===2)showStep(0);};
$('#addon-inputs').oninput=ev=>{if(ev.target.dataset.addon){state.addons[ev.target.dataset.addon]=Number(ev.target.value);dirty();renderBag();}};
$('#to-details').onclick=()=>showStep(1);
$$('[data-step]').forEach(b=>b.onclick=()=>{if(!pending)showStep(Number(b.dataset.step));});
$('#step-1').onsubmit=ev=>{ev.preventDefault();showStep(2);};
$('#step-1').addEventListener('input',()=>{dirty();renderBag();});
$$('[name=fulfillment]').forEach(x=>x.onchange=setDelivery);
$('#policy-accept').onchange=()=>{dirty();$('#square-pay').disabled=!ready||!$('#policy-accept').checked;};
$('#order-photos').onchange=async ev=>{error('');const files=[...ev.target.files];if(files.length+state.photos.length>4){error('Please choose up to four photos total.');ev.target.value='';return;}
 try{for(const file of files){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>3*1024*1024)throw Error('Use JPG, PNG, or WebP photos under 3 MB each.');}
 const loaded=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({name:file.name,type:file.type,data:r.result});r.onerror=()=>reject(Error('That photo could not be read. Please try another.'));r.readAsDataURL(file);})));state.photos.push(...loaded);dirty();photos();}catch(e){error(e.message);}ev.target.value='';};
$('#square-pay').onclick=async()=>{if(!ready||pending)return;readDetails();try{M.validate(state);}catch(e){error(e.message);return;}pending=true;$('#square-pay').disabled=true;$('#square-pay').textContent='Preparing secure checkout…';error('');
 try{requestKey=requestKey||uid();const res=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':requestKey},body:JSON.stringify(state)});const data=await res.json();if(!res.ok)throw Error(data.error||'Checkout could not be opened. Please try again.');const url=new URL(data.url);if(url.protocol!=='https:'||!['square.link','sandbox.square.link','checkout.square.site','connect.squareupsandbox.com'].includes(url.hostname))throw Error('The payment address could not be verified.');location.assign(url.href);}catch(e){error(e.message);pending=false;$('#square-pay').disabled=false;$('#square-pay').textContent='Continue to Square payment →';}};
window.addEventListener('beforeunload',ev=>{if(state.lines.length&&!pending){ev.preventDefault();ev.returnValue='';}});
async function connection(){if(location.protocol==='file:')return;try{const r=await fetch('/api/config');if(!r.ok)return;const config=await r.json();ready=config.checkoutReady===true;if(ready){$('#preview-note').hidden=true;$('#photo-preview-disclaimer').textContent='Your photos are securely submitted with your order when you continue to payment.';$('#payment-note').textContent='Next, Square will securely collect your payment. You can check the final total before paying.';$('#square-pay').textContent='Continue to Square payment →';$('#square-pay').disabled=!$('#policy-accept').checked;}}catch{}}
connection();
if(location.hash==='#build')open();
const paymentToken=new URLSearchParams(location.search).get('order');
if(paymentToken&&location.protocol!=='file:'){
 const panel=document.createElement('div');panel.className='order-status';panel.setAttribute('role','status');panel.textContent='Checking your payment with Square…';$('#top').prepend(panel);
 fetch('/api/order-status?token='+encodeURIComponent(paymentToken)).then(r=>r.json()).then(x=>{panel.textContent=x.status==='paid'?'Thank you! Your payment is confirmed. We’ll review your event date and design details.':x.status==='pending'?'Your payment has not been confirmed yet. If you just paid, refresh this page in a moment. Please do not pay again.':'We could not verify this order. Please contact Orders@revizioneditdesigns.com.';}).catch(()=>panel.textContent='We could not check your payment right now. Please contact Orders@revizioneditdesigns.com before trying another payment.');
}
})();
