const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../public/order-model');
const now=new Date('2026-09-25T04:49:00Z');
function order(){return {lines:[{product:'basic',quantity:1}],addons:{fans:2},event:{date:'2026-10-20',name:'Maya',colors:'Pink',theme:'Stars'},contact:{name:'Maya Smith',email:'maya@example.com',phone:'2175550123'},photos:[],fulfillment:'springfield',accepted:true};}
test('uses Chicago date at UTC midnight boundary',()=>assert.equal(M.dayInChicago(now),'2026-09-24'));
test('14-day boundary does not charge rush; 13 days does',()=>{const o=order();o.event.date='2026-10-08';assert.equal(M.quote(o,now).rush,0);o.event.date='2026-10-07';assert.equal(M.quote(o,now).rush,3000);});
test('shipping charged once regardless of sets; totals in cents',()=>{const o=order();o.lines[0].quantity=2;o.fulfillment='shipping';const q=M.quote(o,now);assert.equal(q.shipping,2000);assert.equal(q.total,16600);});
test('set prices match current price-list artwork',()=>{assert.equal(M.priceLine({product:'cups',size:14,cupType:'Plastic',quantity:1}).total,6500);assert.equal(M.priceLine({product:'shots',size:20,quantity:1}).total,11200);});
test('Create Your Own prices chosen favor types',()=>{assert.equal(M.priceLine({product:'custom',picks:['Cups','Party hats'],quantity:2}).total,24000);assert.throws(()=>M.priceLine({product:'custom',picks:['Cups','Cups'],quantity:1}));});
test('rejects arbitrary prices, invalid quantities, and standalone add-ons',()=>{assert.equal(M.priceLine({product:'basic',quantity:1,price:1}).total,6500);assert.throws(()=>M.priceLine({product:'basic',quantity:-1}));assert.throws(()=>M.quote({...order(),lines:[{product:'cups',size:8,cupType:'Foam',quantity:1}]}));});
test('blocks invalid dates and incomplete orders',()=>{assert.throws(()=>M.quote({...order(),event:{date:'2026-02-30'}},now));assert.throws(()=>M.validate({...order(),accepted:false},now));assert.throws(()=>M.validate({...order(),contact:{name:'M',email:'wrong',phone:'2175550123'}},now));assert.throws(()=>M.validate({...order(),fulfillment:'shipping'},now));});
test('allows valid completed order',()=>assert.equal(M.validate(order(),now).total,8100));
