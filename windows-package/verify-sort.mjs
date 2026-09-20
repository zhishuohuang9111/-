import assert from 'node:assert/strict';
import {sortSamples} from './source/sort.ts';
const rows=[
 {id:'pending',sent:null,quantity:999,returned:0,due:null},
 {id:'low',sent:'2026-09-01',quantity:2,returned:0,due:'2026-09-25'},
 {id:'high',sent:'2026-09-01',quantity:100,returned:100,due:'2026-09-15T00:00:00'},
 {id:'middle',sent:'2026-09-01',quantity:16,returned:4,due:'2026-10-01'},
 {id:'blank',sent:'2026-09-01',quantity:16,returned:4,due:''},
];
const ids=mode=>sortSamples(rows,mode).map(r=>r.id);
assert.deepEqual(ids('sent-asc'),['low','middle','blank','high','pending']);
assert.deepEqual(ids('sent-desc'),['high','middle','blank','low','pending']);
assert.deepEqual(ids('remaining-asc'),['high','low','middle','blank','pending']);
assert.deepEqual(ids('remaining-desc'),['middle','blank','low','high','pending']);
assert.deepEqual(ids('due-asc'),['high','low','middle','pending','blank']);
assert.deepEqual(ids('due-desc'),['middle','low','high','pending','blank']);
assert.deepEqual(ids('default'),['pending','low','high','middle','blank']);
assert.deepEqual(rows.map(r=>r.id),ids('default')); // no mutation; ties preserve incoming order
assert.deepEqual(sortSamples([], 'due-desc'),[]);
assert.deepEqual(sortSamples(rows.filter(r=>r.id==='low'||r.id==='high'),'remaining-desc').map(r=>r.id),['low','high']);
console.log('PASS: six sorting directions, missing dates last, pending quantities last, numeric order, zero balance, stable ties, default order, filtered results, no source mutation.');
