#!/usr/bin/env python3
"""Actual optional Compose topology acceptance with isolated PostgreSQL/Redis.

Reuse the synthetic TLS/account/WS fixtures from test-deployment.py. No live
credentials or existing project volumes are used. Images must already exist.
"""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('deployment_fixture', Path(__file__).with_name('test-deployment.py'))
f = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f)


def main():
    project = f'codex-compose-{os.getpid()}'
    repo = Path(__file__).resolve().parents[3]
    scratch = Path(tempfile.mkdtemp(prefix=project, dir='/tmp'))
    fixture_volume = project+'-fixture'
    helper = project+'-copy'
    app, sidecar, postgres, redis = (project+'-'+name for name in ('app','sidecar','postgres','redis'))
    pg_image = os.environ.get('CODEX_DEPLOY_POSTGRES_IMAGE','docker.m.daocloud.io/library/postgres:16-alpine')
    redis_image = os.environ.get('CODEX_DEPLOY_REDIS_IMAGE','docker.m.daocloud.io/library/redis@sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499')
    compose = ['docker','compose','-p',project,'-f',str(repo/'docker-compose.yml'),'-f',str(repo/'docker-compose.codex-transport.yml'),'-f',str(scratch/'acceptance.yml')]
    upstream = None
    try:
        for image in (f.APP,f.SIDECAR,pg_image,redis_image):
            f.command('docker','image','inspect',image)
        upstream,url = f.start_upstream(scratch)
        f.command('docker','volume','create',fixture_volume)
        f.command('docker','create','--name',helper,'-v',fixture_volume+':/fixture','--entrypoint','/bin/true',f.SIDECAR)
        f.command('docker','cp',str(scratch/'ca.pem'),helper+':/fixture/ca.pem')
        host_mapping = '\n    extra_hosts: ["host.docker.internal:host-gateway"]' if sys.platform.startswith('linux') else ''
        (scratch/'acceptance.yml').write_text(f'''services:
  new-api:
    image: {json.dumps(f.APP)}
    container_name: {app}
    ports: !override ["127.0.0.1::3000"]
    volumes: !override
      - acceptance_data:/data
      - acceptance_logs:/app/logs
      - codex_transport_socket:/run/codex-transport:ro
      - acceptance_fixture:/fixture:ro
    environment:
      CODEX_TRANSPORT_CA_FILE: /fixture/ca.pem
      CountToken: "false"
      SESSION_SECRET: synthetic-compose-only
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      interval: 1s
      timeout: 3s
      retries: 30{host_mapping}
  codex-transport:
    image: {json.dumps(f.SIDECAR)}
    container_name: {sidecar}{host_mapping}
  codex-transport-init:
    image: {json.dumps(f.SIDECAR)}
    container_name: {project}-init
    command: ["chown 10001:10001 /run/codex-transport /data /logs && chmod 0700 /run/codex-transport /data /logs && touch /data/.fixture /logs/.fixture"]
    volumes:
      - acceptance_data:/data
      - acceptance_logs:/logs
  postgres:
    image: {json.dumps(pg_image)}
    container_name: {postgres}
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "root", "-d", "new-api"]
      interval: 1s
      timeout: 3s
      retries: 30
  redis:
    image: {json.dumps(redis_image)}
    container_name: {redis}
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "123456", "ping"]
      interval: 1s
      timeout: 3s
      retries: 30
volumes:
  acceptance_data:
  acceptance_logs:
  acceptance_fixture:
    external: true
    name: {fixture_volume}
''')
        config=json.loads(f.command(*compose,'config','--format','json'))
        assert config['services']['new-api']['environment']['BATCH_UPDATE_ENABLED']=='true'
        assert config['services']['new-api']['environment']['SQL_DSN']=='postgresql://root:123456@postgres:5432/new-api'
        assert config['services']['new-api']['environment']['REDIS_CONN_STRING']=='redis://:123456@redis:6379'
        assert config['services']['new-api']['stop_grace_period']=='2m30s'
        f.command(*compose,'up','-d','--no-build','--wait','--wait-timeout','90')
        f.command(*compose,'stop','new-api')

        def psql(sql):
            return f.command('docker','exec',postgres,'psql','-X','-v','ON_ERROR_STOP=1','-U','root','-d','new-api','-A','-t','-c',sql)

        def literal(value):
            if isinstance(value,bool):
                return 'TRUE' if value else 'FALSE'
            if isinstance(value,int):
                return str(value)
            if isinstance(value,bytes):
                value=value.decode()
            return "'"+value.replace("'","''")+"'"

        rows,options=f.seed_rows(url)
        statements=['BEGIN']
        for table,values in rows:
            columns=','.join('"'+key+'"' for key in values)
            statements.append(f'INSERT INTO "{table}" ({columns}) VALUES ({",".join(literal(value) for value in values.values())})')
        for key,value in options.items():
            statements.append('INSERT INTO options (key,value) VALUES ('+literal(key)+','+literal(value)+') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value')
        statements.append('COMMIT')
        psql(';'.join(statements))
        f.command(*compose,'start','new-api')
        f.eventually(lambda:f.command('docker','inspect','-f','{{.State.Health.Status}}',app)=='healthy','Compose application healthy',45)
        port=int(f.command('docker','port',app,'3000/tcp').rsplit(':',1)[1])
        connection=f.http.client.HTTPConnection('127.0.0.1',port,timeout=15)
        connection.request('POST','/v1/responses',json.dumps({'model':'deployment-model','input':'hello','stream':True,'max_output_tokens':10}),{'Authorization':'Bearer sk-'+f.TOKEN,'Content-Type':'application/json'})
        response=connection.getresponse()
        assert response.status==200,(response.status,response.read())
        assert b'response.completed' in response.read()
        connection.close()
        sock,stream=f.connect_websocket(port)
        f.ws_send(sock,json.dumps({'type':'response.create','model':'deployment-model','input':'hello','max_output_tokens':10}),mask=True)
        while True:
            opcode,payload=f.ws_read(stream)
            assert opcode==1,(opcode,payload)
            if json.loads(payload)['type']=='response.completed':
                break
        f.ws_send(sock,b'\x03\xe8',mask=True,opcode=8)
        stream.close()
        sock.close()
        def exact():
            data=json.loads(psql('''SELECT json_build_array(
              (SELECT json_build_array(quota,used_quota,request_count) FROM users WHERE id=9001),
              (SELECT json_build_array(remain_quota,used_quota) FROM tokens WHERE id=9001),
              (SELECT used_quota FROM channels WHERE id=9001),
              (SELECT json_agg(quota ORDER BY id) FROM logs WHERE token_id=9001 AND type=2))'''))
            return data==[[998000,2000,2],[998000,2000],2000,[1000,1000]]
        f.eventually(exact,'actual PostgreSQL/Redis batch HTTP+WS accounting',15)
        assert f.Upstream.attempts==2,f.Upstream.attempts
        print('PASS actual optional Compose: PostgreSQL+Redis, app+sidecar healthy, SSE+WS exact 2x1000 accounting',flush=True)
        print('PostgreSQL '+psql('SELECT version()'),flush=True)
        print(f.command('docker','exec',redis,'redis-server','--version'),flush=True)
        f.command(*compose,'stop')
        app_end=f.command('docker','inspect','-f','{{.State.FinishedAt}}',app)
        sidecar_end=f.command('docker','inspect','-f','{{.State.FinishedAt}}',sidecar)
        assert app_end<sidecar_end,(app_end,sidecar_end)
        assert f.command('docker','inspect','-f','{{.State.ExitCode}}',app)=='0'
        print(f'PASS Compose stop ordering app={app_end} sidecar={sidecar_end}',flush=True)
        for image in (f.APP,f.SIDECAR,pg_image,redis_image):
            print(f.command('docker','image','inspect','-f','{{.Id}} {{json .RepoDigests}}',image),flush=True)
    except Exception:
        print(f.command('docker','logs','--tail','40',app,check=False))
        raise
    finally:
        if upstream:
            upstream.shutdown()
        if (scratch/'acceptance.yml').exists():
            f.command(*compose,'down','--volumes','--remove-orphans',check=False)
        f.command('docker','rm','-f',helper,check=False)
        f.command('docker','volume','rm',fixture_volume,check=False)
        shutil.rmtree(scratch,ignore_errors=True)


if __name__=='__main__':
    main()
