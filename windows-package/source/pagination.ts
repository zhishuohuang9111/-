export const PAGE_SIZE=10;
export function paginate<T>(records:readonly T[],requestedPage:number){
 const pages=Math.max(1,Math.ceil(records.length/PAGE_SIZE));
 const page=Math.min(pages,Math.max(1,Math.floor(requestedPage)||1));
 const offset=(page-1)*PAGE_SIZE;
 return {page,pages,items:records.slice(offset,offset+PAGE_SIZE),start:records.length?offset+1:0,end:Math.min(offset+PAGE_SIZE,records.length)};
}
