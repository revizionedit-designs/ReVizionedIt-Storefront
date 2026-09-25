(function(root){
'use strict';
const catalog={
 basic:{name:'Basic Bash',price:6500,package:true,description:'1 custom bucket, 10 shot glasses, and 10 foam cups.'},
 close:{name:'Close Friends',price:8500,package:true,description:'1 custom bucket, 5 foam cups, 5 shot glasses, 5 plastic cups, and 5 party hats or fans.'},
 celebrity:{name:'Celebrity',price:12500,package:true,description:'1 custom bucket and 10 each of foam cups, plastic cups, party hats, shot glasses, and custom fans.'},
 cups:{name:'Cups only',prices:{8:2500,10:3500,12:4200,14:6500,20:7000},description:'Choose foam or plastic cups and your set size.'},
 shots:{name:'Shot glasses only',prices:{8:5000,10:6600,12:8000,14:9600,20:11200},description:'Custom shot glasses in your event theme.'},
 custom:{name:'Create Your Own',package:true,description:'Pick 1–10 favor types. $60 per pick, with 12 of each item unless otherwise stated.'}
};
const picks=['Party hats','Chip bags','Rice Krispies','Ring Pops','Cheez-Its','Pringles','Capri Sun','Fruit snacks','Cups','Custom plates','Coloring books','Bubbles','Goodie bags','Water bottles'];
const addons={buttons:{name:'Custom buttons',price:300},cups:{name:'Cups',price:300},fans:{name:'Custom fans',price:800},shots:{name:'Shot glasses',price:800},hats:{name:'Custom party hats',price:1500},bucket:{name:'Custom bucket',price:1500},shirt:{name:'Custom shirt',price:2500},board:{name:'Custom board',price:3000}};
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
function dayInChicago(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function daysUntil(date,now=new Date()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Choose a valid event date.');
 return Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(dayInChicago(now)+'T12:00:00Z'))/86400000);
}
function priceLine(line){
 if(!line||!Object.hasOwn(catalog,line.product))throw Error('Choose a valid product.');
 const p=catalog[line.product];let unit=p.price,detail='';
 if(!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>20)throw Error('Choose between 1 and 20 sets.');
 if(p.prices){unit=p.prices[line.size];if(unit===undefined)throw Error('Choose a listed set size.');detail=`${line.size} ${line.product==='cups'?'cups':'shot glasses'} per set`;}
 if(line.product==='cups'){if(!['Foam','Plastic'].includes(line.cupType))throw Error('Choose foam or plastic cups.');detail=line.cupType+' · '+detail;}
 if(line.product==='close'){if(!['Party hats','Fans'].includes(line.choice))throw Error('Choose party hats or fans.');detail='Includes 5 '+line.choice.toLowerCase();}
 if(line.product==='custom'){
  if(!Array.isArray(line.picks)||line.picks.length<1||line.picks.length>10||new Set(line.picks).size!==line.picks.length||line.picks.some(x=>!picks.includes(x)))throw Error('Choose 1–10 different favor types.');
  unit=line.picks.length*6000;detail=line.picks.join(', ')+' · 12 of each';
 }
 return {name:p.name,detail,quantity:line.quantity,unit,total:unit*line.quantity,package:!!p.package};
}
function quote(order,now=new Date()){
 if(!order||!Array.isArray(order.lines)||!order.lines.length||order.lines.length>30)throw Error('Add at least one item to your order.');
 const lines=order.lines.map(priceLine),extra=[];const hasPackage=lines.some(x=>x.package);
 for(const [key,qty] of Object.entries(order.addons||{})){
  if(!Object.hasOwn(addons,key)||!Number.isInteger(qty)||qty<0||qty>100)throw Error('Choose a valid add-on quantity.');
  if(qty){if(!hasPackage)throw Error('Add-ons require a package order.');extra.push({name:addons[key].name,quantity:qty,unit:addons[key].price,total:qty*addons[key].price});}
 }
 let rush=0;if(order.event?.date){const days=daysUntil(order.event.date,now);if(days<1)throw Error('Choose an event date after today.');if(days<14)rush=3000;}
 const shipping=order.fulfillment==='shipping'?2000:0;
 const subtotal=[...lines,...extra].reduce((n,x)=>n+x.total,0);
 return {lines,addons:extra,subtotal,shipping,rush,total:subtotal+shipping+rush,hasPackage};
}
function validate(order,now=new Date()){
 const q=quote(order,now),e=order.event||{},c=order.contact||{};
 const required=(v,label,max=250)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Please complete '+label+'.');};
 required(e.date,'your event date');daysUntil(e.date,now);required(e.name,'the event name');required(e.colors,'your colors');required(e.theme,'your theme or freestyle request');
 required(c.name,'your name');required(c.email,'your email');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email))throw Error('Enter a valid email.');required(c.phone,'your phone number');if(c.phone.replace(/\D/g,'').length<10)throw Error('Enter a valid phone number.');
 if(!['shipping','springfield','chicago'].includes(order.fulfillment))throw Error('Choose shipping or pickup.');
 if(order.fulfillment==='shipping'){for(const k of ['line1','city','state','zip'])required(order.address?.[k],'your shipping '+k);if(!/^[A-Z]{2}$/.test(order.address.state)||!/^\d{5}(-\d{4})?$/.test(order.address.zip))throw Error('Enter a valid US state and ZIP code.');}
 if(order.addons?.shirt>0&&!(e.notes||'').trim())throw Error('Please add shirt sizes and quantities in the extra instructions.');
 if(order.accepted!==true)throw Error('Please agree to the order policy.');
 for(const v of [e.notes,e.age,e.zodiac])if(v!==undefined&&(typeof v!=='string'||v.length>2000))throw Error('Please shorten your event details.');
 if(!Array.isArray(order.photos)||order.photos.length>4)throw Error('Choose up to four photos.');
 return q;
}
const api={catalog,picks,addons,money,dayInChicago,daysUntil,priceLine,quote,validate};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.OrderModel=api;
})(globalThis);
