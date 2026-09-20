export type SortMode = 'default' | 'sent-desc' | 'sent-asc' | 'remaining-desc' | 'remaining-asc' | 'due-asc' | 'due-desc';
type SortableSample = { sent: string | null; quantity: number; returned: number; due: string | null };
export const sortOptions: {value: SortMode; label: string}[] = [
 {value:'default',label:'默认顺序'},
 {value:'sent-desc',label:'送出数量：从高到低'},
 {value:'sent-asc',label:'送出数量：从低到高'},
 {value:'remaining-desc',label:'未归还数量：从高到低'},
 {value:'remaining-asc',label:'未归还数量：从低到高'},
 {value:'due-asc',label:'约定归还日期：从近到远'},
 {value:'due-desc',label:'约定归还日期：从远到近'},
];
export function sortSamples<T extends SortableSample>(rows: readonly T[], mode: SortMode): T[] {
 const result=[...rows];
 if(mode==='default')return result;
 const value=(r:T):number|null=>{
  if(mode.startsWith('due-')){
   if(!r.due?.trim())return null;
   const timestamp=Date.parse(r.due.slice(0,10));
   return Number.isFinite(timestamp)?timestamp:null;
  }
  if(!r.sent)return null; // Matches the dash displayed for samples not yet sent.
  return mode.startsWith('sent-')?r.quantity:r.quantity-r.returned;
 };
 const direction=mode.endsWith('-asc')?1:-1;
 return result.sort((a,b)=>{
  const av=value(a),bv=value(b);
  // Empty dates or quantities stay last in either direction; zero is a real value.
  if(av===null)return bv===null?0:1;
  if(bv===null)return -1;
  return (av-bv)*direction;
 });
}
