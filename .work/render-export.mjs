import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load('.work/export-verified.xlsx'));
console.log((await wb.inspect({kind:'region',sheetId:'送样记录',range:'A4:I6',maxChars:1800})).ndjson);
for(const [sheet,range,out] of [['送样记录','A1:I9','samples'],['归还明细','A1:I6','returns']]){const img=await wb.render({sheetName:sheet,range,scale:1,format:'png'});await fs.writeFile(`.work/export-${out}.png`,new Uint8Array(await img.arrayBuffer()))}
