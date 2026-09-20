import assert from 'node:assert/strict';
import {paginate} from './source/pagination.ts';
import {sortSamples} from './source/sort.ts';
const rows=Array.from({length:25},(_,i)=>({id:`RD-${i}`,customer:`客户${i}`,owner:i===24?'末页申请人':'张三',batch:`B${i}`,spec:'32G',quantity:i+1,returned:0,sent:'2026-09-01',due:null}));
assert.equal(paginate(rows,1).items.length,10);
assert.equal(paginate(rows,2).items[0].id,'RD-10');
assert.equal(paginate(rows,3).items.length,5);
assert.equal(paginate(rows.slice(0,20),3).page,2);
assert.deepEqual(paginate([],99),{page:1,pages:1,items:[],start:0,end:0});
assert.equal(paginate(rows.slice(0,10),1).pages,1);
for(const query of ['末页申请人','客户24','B24','RD-24']){
 const matched=rows.filter(r=>[r.customer,r.spec,r.batch,r.id,r.owner].join(' ').toLowerCase().includes(query.toLowerCase()));
 assert.equal(paginate(sortSamples(matched,'default'),1).items[0].id,'RD-24');
}
assert.equal(paginate(sortSamples(rows,'sent-desc'),1).items[0].quantity,25);
assert.equal(paginate(sortSamples(rows,'sent-desc'),2).items[0].quantity,15);
console.log('PASS: 10 per page, final partial page, deletion clamps page, empty/exact-size pages, search across all records, sort before pagination');
