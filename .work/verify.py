import urllib.request,urllib.error,json,uuid
urllib.request.install_opener(urllib.request.build_opener(urllib.request.ProxyHandler({})))
base='http://localhost:5173/api/samples'
def post(**data):
 req=urllib.request.Request(base,data=json.dumps(data).encode(),headers={'Content-Type':'application/json','Origin':'http://localhost:5173'})
 try:
  with urllib.request.urlopen(req) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
def read():return json.load(urllib.request.urlopen(base))
initial=read();assert len(initial['rows'])==7;assert sum(r['quantity'] for r in initial['rows'] if r['sent'])==88
code,d=post(action='create',customer='本地流程验证',owner='验证',spec='32G 5600',quantity=10);assert code==200,(code,d);id=d['id'];open('/private/tmp/rdimm-test-id','w').write(id)
assert post(action='return',id=id,quantity=1,returned_on='2026-09-15',requestId=str(uuid.uuid4()))[0]==400
assert post(action='send',id=id,batch='TEST-LOCAL',sent='2026-09-15',due='2026-09-14')[0]==400
assert post(action='send',id=id,batch='TEST-LOCAL',sent='2026-09-15',due='2026-09-20')[0]==200
assert post(action='send',id=id,batch='TEST-LOCAL',sent='2026-09-15',due='2026-09-20')[0]==409
assert post(action='return',id=id,quantity=11,returned_on='2026-09-15',requestId=str(uuid.uuid4()))[0]==409
key=str(uuid.uuid4());assert post(action='return',id=id,quantity=4,returned_on='2026-09-15',requestId=key)[0]==200
assert post(action='return',id=id,quantity=4,returned_on='2026-09-15',requestId=key)[0]==409
assert next(r for r in read()['rows'] if r['id']==id)['returned']==4
assert post(action='return',id=id,quantity=7,returned_on='2026-09-15',requestId=str(uuid.uuid4()))[0]==409
assert post(action='return',id=id,quantity=6,returned_on='2026-09-15',requestId=str(uuid.uuid4()))[0]==200
final=read();assert next(r for r in final['rows'] if r['id']==id)['returned']==10;assert len([r for r in final['returns'] if r['sample_id']==id])==2
print('PASS: initial import, send prerequisites, duplicate send, partial returns, duplicate request, excessive returns, full return, persistence')
