import shutil
import os,sys,tempfile,subprocess,urllib.request,urllib.error,json,uuid,socket,time,pathlib,datetime,concurrent.futures,sqlite3
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
package=pathlib.Path(__file__).resolve().parent/'release'/'RDIMM-Windows'
node='/Users/yanmeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date();d=str(today);due=str(today+datetime.timedelta(days=7))
with tempfile.TemporaryDirectory(prefix='rdimm-verification-') as tmp:
 test_package=pathlib.Path(tmp)/'app'
 shutil.copytree(package,test_package,ignore=shutil.ignore_patterns('runtime','data','back_up'))
 package=test_package
 with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
 env={**os.environ,'RDIMM_DATA_DIR':tmp,'RDIMM_PORT':str(port)};base=f'http://127.0.0.1:{port}'
 def launch():
  p=subprocess.Popen([node,'--no-warnings','server.cjs'],cwd=package,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
  for _ in range(60):
   if p.poll() is not None:raise RuntimeError(p.stdout.read().decode())
   try:opener.open(base+'/health',timeout=1);return p
   except:time.sleep(.1)
  raise RuntimeError('Startup timeout')
 def read():return json.load(opener.open(base+'/api/samples'))
 def post(**b):
  req=urllib.request.Request(base+'/api/samples',data=json.dumps(b).encode(),headers={'Content-Type':'application/json','Origin':base})
  try:
   with opener.open(req) as r:return r.status,json.load(r)
  except urllib.error.HTTPError as e:return e.code,json.load(e)
 p=launch()
 try:
  assert opener.open(base+'/').status==200
  initial=read();expected=json.load(open(package/'initial-data.json'));assert len(initial['rows'])==len(expected['rows'])
  assert sum(r['returned'] for r in initial['rows'])==sum(r['quantity'] for r in initial['returns'])
  c,r=post(action='create',customer='验证客户',owner='测试',spec='32G 5600',quantity=10);assert c==200,(c,r);id=r['id']
  assert post(action='return',id=id,quantity=1,returned_on=d,requestId=str(uuid.uuid4()))[0]==400
  assert post(action='send',id=id,batch='B001',sent=d,due=str(today-datetime.timedelta(days=1)))[0]==400
  assert post(action='send',id=id,batch='B001',sent=d,due=due)[0]==200
  assert post(action='send',id=id,batch='B001',sent=d,due=due)[0]==409
  assert post(action='return',id=id,quantity=11,returned_on=d,requestId=str(uuid.uuid4()))[0]==409
  key=str(uuid.uuid4());assert post(action='return',id=id,quantity=4,returned_on=d,requestId=key)[0]==200
  assert post(action='return',id=id,quantity=4,returned_on=d,requestId=key)[0]==409
  assert next(r for r in read()['rows'] if r['id']==id)['returned']==4
  with concurrent.futures.ThreadPoolExecutor() as pool:
   results=list(pool.map(lambda _:post(action='return',id=id,quantity=6,returned_on=d,requestId=str(uuid.uuid4()))[0],range(2)))
  assert sorted(results)==[200,409],results
  assert next(r for r in read()['rows'] if r['id']==id)['returned']==10
  assert len([r for r in read()['returns'] if r['sample_id']==id])==2
  duplicate=subprocess.run([node,'--no-warnings','server.cjs'],cwd=package,env=env,capture_output=True,timeout=10);assert duplicate.returncode==0,duplicate.stdout
 finally:p.terminate();p.wait(timeout=5)
 p=launch()
 try:
  assert next(r for r in read()['rows'] if r['id']==id)['returned']==10
  assert len(read()['rows'])==len(expected['rows'])+1
  assert list(pathlib.Path(tmp,'backups').glob('*.sqlite'))
  # Invalid confirmation must never mutate records.
  before=read();assert post(action='delete',id=id)[0]==400;assert read()==before
  # If removing the parent fails, the child returns must remain too.
  with sqlite3.connect(pathlib.Path(tmp,'rdimm.sqlite')) as connection:
   connection.execute("CREATE TRIGGER fail_delete BEFORE DELETE ON samples BEGIN SELECT RAISE(ABORT, 'test deletion rollback'); END")
  assert post(action='delete',id=id,confirm=True)[0]==500;assert read()==before
  with sqlite3.connect(pathlib.Path(tmp,'rdimm.sqlite')) as connection:connection.execute('DROP TRIGGER fail_delete')
  count=len(before['rows']);returned=sum(r['returned'] for r in before['rows'])
  assert post(action='delete',id=id,confirm=True)[0]==200
  after=read();assert len(after['rows'])==count-1;assert sum(r['returned'] for r in after['rows'])==returned-10
  assert not any(r['sample_id']==id for r in after['returns'])
  assert post(action='delete',id=id,confirm=True)[0]==200;assert read()==after
  # A partially returned record due today affects all relevant totals.
  c,r=post(action='create',customer='删除校验',owner='测试',spec='64G',quantity=12);partial=r['id'];assert c==200
  assert post(action='send',id=partial,batch='DEL-TEST',sent=d,due=d)[0]==200
  assert post(action='return',id=partial,quantity=3,returned_on=d,requestId=str(uuid.uuid4()))[0]==200
  before=read();outside=lambda data:sum(r['quantity']-r['returned'] for r in data['rows'] if r['sent'])
  alert=lambda data:len([r for r in data['rows'] if r['sent'] and r['returned']<r['quantity'] and (not r['due'] or r['due'][:10]<=due)])
  assert post(action='delete',id=partial,confirm=True)[0]==200;after=read()
  assert outside(before)-outside(after)==9;assert alert(before)-alert(after)==1
  assert sum(r['returned'] for r in before['rows'])-sum(r['returned'] for r in after['rows'])==3
  assert not any(r['sample_id']==partial for r in after['returns'])
  c,r=post(action='create',customer='待送样删除',owner='测试',spec='64G',quantity=5);pending=r['id'];before=read()
  assert post(action='delete',id=pending,confirm=True)[0]==200;after=read()
  waiting=lambda data:sum(r['quantity'] for r in data['rows'] if not r['sent'])
  assert waiting(before)-waiting(after)==5
  seed_id=expected['rows'][0]['id'];assert post(action='delete',id=seed_id,confirm=True)[0]==200
  # Other original records are unchanged after all these deletions.
  assert [r for r in read()['rows'] if r['id']!=seed_id]==[r for r in initial['rows'] if r['id']!=seed_id]
 finally:p.terminate();p.wait(timeout=5)
 p=launch()
 try:
  data=read();assert not any(r['id'] in [id,partial,pending,seed_id] for r in data['rows'])
  assert not any(r['sample_id'] in [id,partial,pending,seed_id] for r in data['returns'])
  assert len(data['rows'])==len(initial['rows'])-1
  c,r=post(action='create',customer='清空测试',owner='测试',spec='64G',quantity=8);reset_id=r['id'];assert c==200
  assert post(action='send',id=reset_id,batch='RESET-TEST',sent=d,due=d)[0]==200
  assert post(action='return',id=reset_id,quantity=3,returned_on=d,requestId=str(uuid.uuid4()))[0]==200
  before=read();reset_key=str(uuid.uuid4());dbfile=pathlib.Path(tmp,'rdimm.sqlite');inode=dbfile.stat().st_ino
  assert post(action='reset',requestId=reset_key)[0]==400;assert read()==before
  assert post(action='reset',confirm=True,requestId='bad')[0]==400;assert read()==before
  backup_dir=pathlib.Path(tmp,'backups');held=pathlib.Path(tmp,'backups-held');backup_dir.rename(held);backup_dir.write_text('simulate backup failure')
  try:assert post(action='reset',confirm=True,requestId=reset_key)[0]==500;assert read()==before
  finally:backup_dir.unlink();held.rename(backup_dir)
  with sqlite3.connect(dbfile) as connection:connection.execute("CREATE TRIGGER fail_reset BEFORE DELETE ON samples BEGIN SELECT RAISE(ABORT, 'test reset rollback'); END")
  assert post(action='reset',confirm=True,requestId=reset_key)[0]==500;assert read()==before
  with sqlite3.connect(dbfile) as connection:connection.execute('DROP TRIGGER fail_reset')
  c,result=post(action='reset',confirm=True,requestId=reset_key);assert c==200,(c,result)
  assert result['samplesRemoved']==len(before['rows']) and result['returnsRemoved']==len(before['returns'])
  assert read()=={'rows':[],'returns':[]};assert dbfile.exists() and dbfile.stat().st_ino==inode
  backup=pathlib.Path(tmp,'backups',result['backup'].split('/')[-1]);assert backup.exists()
  with sqlite3.connect(backup) as connection:
   assert connection.execute('SELECT COUNT(*) FROM samples').fetchone()[0]==len(before['rows'])
   assert connection.execute('SELECT COUNT(*) FROM returns').fetchone()[0]==len(before['returns'])
  with sqlite3.connect(dbfile) as connection:assert connection.execute("SELECT value FROM settings WHERE key='initialized'").fetchone()[0]=='1'
 finally:p.terminate();p.wait(timeout=5)
 p=launch()
 try:
  assert read()=={'rows':[],'returns':[]}
  c,new=post(action='create',customer='重新建立',owner='测试',spec='32G',quantity=2);assert c==200
  assert post(action='reset',confirm=True,requestId=reset_key)==(200,result)
  assert len(read()['rows'])==1 and read()['rows'][0]['id']==new['id']
 finally:p.terminate();p.wait(timeout=5)
print('PASS: existing workflows/deletion; reset confirmation; backup failure preserves data; transaction rollback; backup content; data directory and database preserved; all records cleared; empty after restart; new records supported; retry does not erase new records')
