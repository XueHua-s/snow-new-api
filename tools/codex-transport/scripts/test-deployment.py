#!/usr/bin/env python3
"""Isolated real application/sidecar lifecycle acceptance; synthetic accounts only.

Requires Docker, openssl and Python 3. The two images must already be built from
this checkout. No production credentials, existing volumes or databases are used.
"""
import base64
import hashlib
import http.client
import http.server
import json
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import ssl
import struct
import sys
import subprocess
import tempfile
import threading
import time

APP = os.environ.get('CODEX_DEPLOY_APP_IMAGE', 'new-api-codex:s08-candidate')
SIDECAR = os.environ.get('CODEX_DEPLOY_SIDECAR_IMAGE', 'codex-transport:openssl364')
PREFIX = f'codex-deployment-{os.getpid()}'
HOST_ARGS = ['--add-host','host.docker.internal:host-gateway'] if sys.platform.startswith('linux') else []
TOKEN = 'syntheticdeploymenttoken'
INITIAL = 1000000
SHUTDOWN_SECONDS = 120
APP_STOP_SECONDS = 150
SIDECAR_STOP_SECONDS = 45


def command(*args, check=True):
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and result.returncode:
        raise RuntimeError(f'{args[0:3]} failed ({result.returncode}): {result.stderr[-3000:]}')
    return (result.stdout + (result.stderr if args[:2] == ('docker','logs') else '')).strip()


def eventually(check, description, seconds=20):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            if check():
                return
        except (OSError, sqlite3.Error, http.client.HTTPException):
            pass
        time.sleep(.05)
    raise AssertionError(f'timed out: {description}')


def ws_send(sock, message, mask=False, opcode=1):
    payload = message.encode() if isinstance(message, str) else message
    flag = 128 if mask else 0
    if len(payload) < 126:
        header = bytes([128 | opcode, flag | len(payload)])
    elif len(payload) < 65536:
        header = bytes([128 | opcode, flag | 126]) + struct.pack('!H', len(payload))
    else:
        header = bytes([128 | opcode, flag | 127]) + struct.pack('!Q', len(payload))
    if mask:
        key = os.urandom(4)
        payload = bytes(value ^ key[i % 4] for i, value in enumerate(payload))
        header += key
    sock.sendall(header + payload)


def read_exact(stream, size):
    result = b''
    while len(result) < size:
        part = stream.read(size - len(result))
        if not part:
            raise EOFError('closed websocket')
        result += part
    return result


def ws_read(stream):
    first, second = read_exact(stream, 2)
    size = second & 127
    if size == 126:
        size = struct.unpack('!H', read_exact(stream, 2))[0]
    elif size == 127:
        size = struct.unpack('!Q', read_exact(stream, 8))[0]
    assert size <= 134217728
    key = read_exact(stream, 4) if second & 128 else None
    payload = read_exact(stream, size)
    if key:
        payload = bytes(value ^ key[i % 4] for i, value in enumerate(payload))
    return first & 15, payload


class Upstream(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    attempts = 0
    resource_active = 0
    resource_attempts = 0
    idle_active = 0
    active = 0
    released = threading.Event()
    entered = threading.Event()
    lock = threading.Lock()

    def log_message(self, *args):
        pass

    def events(self):
        response = {'id': 'synthetic-response-'+str(Upstream.attempts), 'status': 'completed', 'model': 'gpt-4o', 'output': [],
                    'usage': {'input_tokens': 1000, 'output_tokens': 10, 'total_tokens': 1010}}
        return [ {'type': 'response.created', 'response': {'id': 'synthetic-response-'+str(Upstream.attempts), 'status': 'in_progress'}},
                 {'type': 'response.output_text.delta', 'delta': 'hello'},
                 {'type': 'response.completed', 'response': response} ]

    def do_POST(self):
        if self.headers.get('Transfer-Encoding', '').lower() == 'chunked':
            chunks = []
            while True:
                size = int(self.rfile.readline().split(b';',1)[0],16)
                if size == 0:
                    while self.rfile.readline() != b'\r\n':
                        pass
                    break
                chunks.append(read_exact(self.rfile,size))
                assert self.rfile.read(2) == b'\r\n'
            body = b''.join(chunks)
        else:
            body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        request = json.loads(body)
        if self.path == '/resource-idle':
            with self.lock:
                Upstream.idle_active += 1
            self.idle_connection = True
            self.send_response(200)
            self.send_header('Content-Length','2')
            self.end_headers()
            self.wfile.write(b'{}')
            self.wfile.flush()
            return
        if self.path == '/resource':
            with self.lock:
                Upstream.resource_active += 1
                Upstream.resource_attempts += 1
            try:
                self.send_response(200)
                self.send_header('Content-Type','text/event-stream')
                self.send_header('Connection','close')
                self.end_headers()
                self.wfile.write(b'data: held\n\n')
                self.wfile.flush()
                # Wait for actual downstream cancellation propagated over TLS.
                self.connection.settimeout(45)
                assert self.connection.recv(1) == b''
            except (OSError,ssl.SSLError):
                pass
            finally:
                with self.lock:
                    Upstream.resource_active -= 1
                self.close_connection = True
            return
        with self.lock:
            Upstream.attempts += 1
            Upstream.active += 1
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Connection', 'close')
            self.end_headers()
            for event in self.events()[:2]:
                self.wfile.write(('data: ' + json.dumps(event) + '\n\n').encode())
                self.wfile.flush()
            if 'hold' in json.dumps(request.get('input', '')):
                self.entered.set()
                # Event barrier, not a sleep-based streaming success assertion.
                if not self.released.wait(SHUTDOWN_SECONDS+30):
                    raise AssertionError('upstream release barrier timeout')
            self.wfile.write(('data: ' + json.dumps(self.events()[2]) + '\n\ndata: [DONE]\n\n').encode())
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ssl.SSLError):
            pass
        finally:
            with self.lock:
                Upstream.active -= 1
            self.close_connection = True

    def finish(self):
        try:
            super().finish()
        finally:
            if getattr(self,'idle_connection',False):
                with self.lock:
                    Upstream.idle_active -= 1

    def do_GET(self):
        if self.headers.get('Upgrade', '').lower() != 'websocket':
            self.send_error(404)
            return
        accept = base64.b64encode(hashlib.sha1((self.headers['Sec-WebSocket-Key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
        self.send_response(101)
        self.send_header('Upgrade', 'websocket')
        self.send_header('Connection', 'Upgrade')
        self.send_header('Sec-WebSocket-Accept', accept)
        self.end_headers()
        try:
            while True:
                opcode, body = ws_read(self.rfile)
                if opcode == 8:
                    ws_send(self.connection, body, opcode=8)
                    return
                if opcode == 9:
                    ws_send(self.connection, body, opcode=10)
                    continue
                assert opcode == 1
                request = json.loads(body)
                assert request['type'] == 'response.create'
                with self.lock:
                    Upstream.attempts += 1
                for event in self.events()[:2]:
                    ws_send(self.connection, json.dumps(event))
                if 'hold' in json.dumps(request.get('input','')):
                    self.entered.set()
                    assert self.released.wait(SHUTDOWN_SECONDS+30)
                ws_send(self.connection,json.dumps(self.events()[2]))
        except (EOFError, OSError):
            pass
        finally:
            self.close_connection = True


def connect_websocket(port):
    sock = socket.create_connection(('127.0.0.1',port),timeout=10)
    key = base64.b64encode(os.urandom(16)).decode()
    sock.sendall((f'GET /v1/responses?model=deployment-model HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer sk-{TOKEN}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: {key}\r\n\r\n').encode())
    stream = sock.makefile('rb')
    status = stream.readline()
    assert b'101' in status, status
    while stream.readline() != b'\r\n':
        pass
    return sock,stream


def seed_rows(upstream_url):
    rows = [
        ('users', dict(id=9001, username='deployment-fixture', password='unused', role=1, status=1, quota=INITIAL, used_quota=0, request_count=0, group='default', auth_version=1, setting='{"billing_preference":"wallet_only"}')),
        ('tokens', dict(id=9001, user_id=9001, key=TOKEN, name='deployment', status=1, expired_time=-1, remain_quota=INITIAL, used_quota=0, unlimited_quota=False, model_limits_enabled=False, group='default')),
        ('channels', dict(id=9001, type=57, key='{"access_token":"synthetic-unused","account_id":"synthetic-deployment","expired":"2099-01-01T00:00:00Z"}', status=1, name='deployment', models='deployment-model', group='default', base_url=upstream_url, used_quota=0, auto_ban=0, model_mapping='{"deployment-model":"gpt-4o"}', setting='{"responses_websocket_enabled":true}', channel_info=b'{}', settings='{}')),
        ('abilities', dict(group='default', model='deployment-model', channel_id=9001, enabled=True, priority=0, weight=0)),
    ]
    options = {'billing_setting.billing_mode':'{"deployment-model":"tiered_expr"}', 'billing_setting.billing_expr':json.dumps({'deployment-model':'tier("request",2000)'}), 'group_ratio_setting.group_ratio':'{"default":1}', 'perf_metrics_setting.enabled':'true', 'LogConsumeEnabled':'true', 'ModelRequestRateLimitEnabled':'false'}
    return rows,options


def seed_database():
    database = sqlite3.connect('/data/deployment.db')
    rows,options=seed_rows(os.environ['RESOURCE_URL'])
    for table,values in rows:
        keys=','.join('"'+key+'"' for key in values)
        database.execute(f'INSERT INTO "{table}" ({keys}) VALUES ({",".join("?" for _ in values)})',tuple(values.values()))
    for key,value in options.items():
        database.execute('INSERT OR REPLACE INTO options (key,value) VALUES (?,?)',(key,value))
    database.commit()
    database.close()

def resource_client():
    meta = dict(version=1,request_id='resource',profile='0.162.1',purpose='api',method='POST',url=os.environ['RESOURCE_URL']+'/resource',headers=[['content-type',base64.b64encode(b'application/json').decode()]],content_length=2,proxy_url=None,http_protocol='http1',shards=1,idle_timeout_ms=1000,max_idle_connections=256,max_idle_per_host=256,ca_pem_b64=base64.b64encode(Path('/fixture/ca.pem').read_bytes()).decode(),connect_timeout_ms=30000,header_timeout_ms=0,total_timeout_ms=0,max_request_bytes=1024,max_ws_message_bytes=1024)
    wire = ('POST /v1/http HTTP/1.1\r\nHost: codex-transport\r\nTE: trailers\r\nContent-Length: 2\r\nX-Codex-Transport-Meta: '+base64.b64encode(json.dumps(meta).encode()).decode()+'\r\n\r\n{}').encode()
    def connect():
        sock = socket.socket(socket.AF_UNIX)
        sock.settimeout(30)
        sock.connect('/run/codex-transport/transport.sock')
        sock.sendall(wire)
        response = http.client.HTTPResponse(sock)
        response.begin()
        return sock,response
    for cycle in range(2):
        held=[]
        for _ in range(256):
            sock,response=connect()
            assert response.status==200,(response.status,response.getheaders())
            assert response.getheader('X-Codex-Transport-Response')
            held.append((sock,response))
        extra,response=connect()
        error=json.loads(base64.b64decode(response.getheader('X-Codex-Transport-Error')))
        assert error['code']=='capacity' and error['may_have_sent'] is False,error
        response.close()
        extra.close()
        print(f'ADMITTED {cycle} 256 REJECTED 257',flush=True)
        assert sys.stdin.readline().strip()=='CANCEL'
        for sock,response in held:
            sock.shutdown(socket.SHUT_RDWR)
            response.close()
            sock.close()
        print('CANCELLED',flush=True)
        assert sys.stdin.readline().strip()=='NEXT'
    meta['url']=os.environ['RESOURCE_URL']+'/resource-idle'
    wire = ('POST /v1/http HTTP/1.1\r\nHost: codex-transport\r\nTE: trailers\r\nContent-Length: 2\r\nX-Codex-Transport-Meta: '+base64.b64encode(json.dumps(meta).encode()).decode()+'\r\n\r\n{}').encode()
    sock,response=connect()
    assert response.read()==b'{}'
    response.close()
    sock.close()
    print('IDLE POOLED',flush=True)
    assert sys.stdin.readline().strip()=='NEXT'
    print('RESOURCE PASS',flush=True)


def start_upstream(scratch):
    # Synthetic private keys never enter the repository or either image.
    command('openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(scratch/'ca.key'), '-out', str(scratch/'ca.pem'), '-days', '1', '-subj', '/CN=synthetic-deployment-ca')
    command('openssl', 'req', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(scratch/'leaf.key'), '-out', str(scratch/'leaf.csr'), '-subj', '/CN=host.docker.internal')
    (scratch/'leaf.ext').write_text('subjectAltName=DNS:host.docker.internal\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n')
    command('openssl', 'x509', '-req', '-in', str(scratch/'leaf.csr'), '-CA', str(scratch/'ca.pem'), '-CAkey', str(scratch/'ca.key'), '-CAcreateserial', '-out', str(scratch/'leaf.pem'), '-days', '1', '-extfile', str(scratch/'leaf.ext'))
    upstream = http.server.ThreadingHTTPServer(('0.0.0.0', 0), Upstream)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(scratch/'leaf.pem', scratch/'leaf.key')
    upstream.socket = context.wrap_socket(upstream.socket, server_side=True)
    threading.Thread(target=upstream.serve_forever, daemon=True).start()
    upstream_url = f'https://host.docker.internal:{upstream.server_port}'
    return upstream,upstream_url


def main():
    repo=Path(__file__).resolve().parents[3]
    config=json.loads(command('docker','compose','-f',str(repo/'docker-compose.yml'),'-f',str(repo/'docker-compose.codex-transport.yml'),'config','--format','json'))
    assert config['services']['new-api']['stop_grace_period']=='2m30s'
    assert config['services']['new-api']['environment']['BATCH_UPDATE_ENABLED']=='true'
    assert config['services']['codex-transport']['stop_grace_period']=='45s'
    assert config['services']['new-api']['depends_on']['codex-transport']['condition']=='service_healthy'
    command('docker','image','inspect',APP)
    command('docker','image','inspect',SIDECAR)
    scratch = Path(tempfile.mkdtemp(prefix=PREFIX,dir='/tmp'))
    app, sidecar, volume = PREFIX + '-app', PREFIX + '-sidecar', PREFIX + '-socket'
    resource_name=PREFIX+'-resources'
    data_volume=PREFIX+'-data'
    fixture_volume=PREFIX+'-fixture'
    os.chmod(scratch, 0o755)
    upstream = None
    try:
        upstream,upstream_url=start_upstream(scratch)
        command('docker', 'volume', 'create', volume)
        command('docker', 'run', '--rm', '--user', '0:0', '--network', 'none', '--entrypoint', '/bin/sh', '-v', volume+':/run/codex-transport', SIDECAR, '-ec', 'chown 10001:10001 /run/codex-transport; chmod 0700 /run/codex-transport')
        command('docker', 'run', '-d', '--name', sidecar, '--stop-timeout',str(SIDECAR_STOP_SECONDS),'--platform', 'linux/arm64', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--ulimit', 'nofile=2048:2048', '-v', volume+':/run/codex-transport', *HOST_ARGS, SIDECAR)
        eventually(lambda: subprocess.run(['docker','exec',sidecar,'codex-transport','health'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0, 'sidecar health')

        # The fixture holds the complete production admission cap twice and checks
        # actual FD/RSS in the deployed sidecar, then cancellation and full reuse.
        runner_image = os.environ.get('CODEX_TRANSPORT_TEST_IMAGE','docker.m.daocloud.io/library/rust@sha256:c1e5f19e773b7878c3f7a805dd00a495e747acbdc76fb2337a4ebf0418896b33')
        command('docker','volume','create',data_volume)
        command('docker','volume','create',fixture_volume)
        command('docker','run','-d','--name',resource_name,'-v',volume+':/run/codex-transport:ro','-v',data_volume+':/data','-v',fixture_volume+':/fixture','-e','RESOURCE_URL='+upstream_url,*HOST_ARGS,runner_image,'sleep','infinity')
        command('docker','cp',str(scratch/'ca.pem'),resource_name+':/fixture/ca.pem')
        command('docker','cp',str(Path(__file__).resolve()),resource_name+':/fixture/test.py')
        command('docker','exec',resource_name,'/bin/sh','-ec','chown 10001:10001 /data; chmod 0700 /data; touch /data/.fixture; chmod 0755 /fixture; chmod 0644 /fixture/ca.pem /fixture/test.py')
        resource=subprocess.Popen(['docker','exec','-i','--user','10001:10001',resource_name,'python3','/fixture/test.py','--resource-client'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
        try:
            for cycle in range(2):
                assert resource.stdout.readline().strip()==f'ADMITTED {cycle} 256 REJECTED 257'
                assert Upstream.resource_active==256,Upstream.resource_active
                assert Upstream.resource_attempts==(cycle+1)*256,Upstream.resource_attempts
                metrics=command('docker','exec',sidecar,'/bin/sh','-ec','printf "FD="; ls /proc/1/fd | wc -l; grep -E "VmRSS|VmPeak" /proc/1/status')
                fd=int(metrics.splitlines()[0].split('=')[1])
                assert fd<2048,metrics
                print(f'PASS resource cycle={cycle} active=256 {metrics}',flush=True)
                resource.stdin.write('CANCEL\n'); resource.stdin.flush()
                assert resource.stdout.readline().strip()=='CANCELLED'
                eventually(lambda: Upstream.resource_active==0,'all256 upstream connections cancelled')
                resource.stdin.write('NEXT\n'); resource.stdin.flush()
            assert resource.stdout.readline().strip()=='IDLE POOLED'
            assert Upstream.idle_active==1,Upstream.idle_active
            eventually(lambda: Upstream.idle_active==0,'configured 1000ms idle socket cleanup',10)
            print('PASS pooled upstream connection expires after configured idle timeout',flush=True)
            print(command('docker','exec',sidecar,'/bin/sh','-ec','printf "FD_after_cleanup="; ls /proc/1/fd | wc -l; grep VmRSS /proc/1/status'),flush=True)
            resource.stdin.write('NEXT\n'); resource.stdin.flush()
            assert resource.stdout.readline().strip()=='RESOURCE PASS'
            assert resource.wait(timeout=10)==0
        finally:
            resource.stdin.close()
        print('PASS full256 readmission after cancellation; 257th zero-send rejection',flush=True)

        def start(enabled=True,profile="0.162.1",expect_ready=True,batch=False):
            command('docker', 'rm', '-f', app, check=False)
            command('docker', 'run', '-d', '--name', app, '--stop-timeout',str(APP_STOP_SECONDS),'--platform', 'linux/arm64', '--user', '10001:10001', '-p', '127.0.0.1::3000', '--mount','type=volume,src='+data_volume+',dst=/data,volume-nocopy', '-v', volume+':/run/codex-transport:ro', '-v', fixture_volume+':/fixture:ro', '-e', 'SQLITE_PATH=/data/deployment.db', '-e', 'CODEX_TRANSPORT_ENABLED='+str(enabled).lower(), '-e','CODEX_TRANSPORT_PROFILE='+profile,'-e', 'CODEX_TRANSPORT_SOCKET=/run/codex-transport/transport.sock', '-e', 'CODEX_TRANSPORT_CA_FILE=/fixture/ca.pem', '-e', 'SSL_CERT_FILE=/fixture/ca.pem', '-e', 'CountToken=false', '-e','BATCH_UPDATE_ENABLED='+str(batch).lower(),'-e','BATCH_UPDATE_INTERVAL='+('3600' if batch else '5'), '-e', 'MEMORY_CACHE_ENABLED=false', '-e', 'SHUTDOWN_TIMEOUT_SECONDS='+str(SHUTDOWN_SECONDS), '-e', 'RELAY_IDLE_CONN_TIMEOUT=1', '-e', 'SESSION_SECRET=synthetic-deployment-only', *HOST_ARGS, APP)
            assert command('docker','inspect','-f','{{.Config.StopTimeout}}',app)==str(APP_STOP_SECONDS)
            if not expect_ready:
                eventually(lambda: command('docker','inspect','-f','{{.State.Running}}',app)=='false','invalid profile startup rejection')
                assert command('docker','inspect','-f','{{.State.ExitCode}}',app)!='0'
                return 0
            port = int(command('docker','port',app,'3000/tcp').rsplit(':',1)[1])
            def ready():
                connection = http.client.HTTPConnection('127.0.0.1', port, timeout=1)
                try:
                    connection.request('GET', '/api/status')
                    response = connection.getresponse()
                    return response.status == 200 and json.loads(response.read())['success']
                finally:
                    connection.close()
            eventually(ready, 'actual app health', 45)
            return port

        start(profile='invalid-profile',expect_ready=False)
        assert Upstream.attempts==0
        port = start()
        command('docker','stop',app)
        command('docker','exec','--user','10001:10001',resource_name,'python3','/fixture/test.py','--seed')
        port = start()
        completed = 0

        def accounting(expected):
            raw=command('docker','exec',resource_name,'python3','/fixture/test.py','--accounting')
            row,token,channel,logs=json.loads(raw)
            return row == [INITIAL-1000*expected,1000*expected,expected] and token == [INITIAL-1000*expected,1000*expected] and channel == 1000*expected and logs == [[1000]]*expected

        def settle(count):
            try:
                eventually(lambda: accounting(count), f'exact wallet/token/user/channel/log accounting {count}', 10)
            except AssertionError as error:
                raise AssertionError(str(error)+' snapshot='+command('docker','exec',resource_name,'python3','/fixture/test.py','--accounting')) from error
            print(f'PASS accounting generations={count} charge={count*1000}', flush=True)

        def post(value='hello'):
            connection = http.client.HTTPConnection('127.0.0.1',port,timeout=20)
            connection.request('POST','/v1/responses',json.dumps({'model':'deployment-model','input':value,'stream':True,'max_output_tokens':10}), {'Authorization':'Bearer sk-'+TOKEN,'Content-Type':'application/json'})
            response = connection.getresponse()
            assert response.status == 200, (response.status,response.read().decode())
            return connection,response

        connection,response = post()
        assert b'response.completed' in response.read()
        connection.close()
        completed += 1
        settle(completed)

        # One physical WS, two independently authenticated/reserved/settled creates.
        sock,stream = connect_websocket(port)
        for _ in range(2):
            ws_send(sock,json.dumps({'type':'response.create','model':'deployment-model','input':'hello','max_output_tokens':10}),mask=True)
            while True:
                opcode,payload = ws_read(stream)
                assert opcode == 1,(opcode,payload)
                if json.loads(payload)['type'] == 'response.completed':
                    break
            completed += 1
            settle(completed)
        # Restart while WS is idle: close the old authenticated physical session.
        command('docker','restart',sidecar)
        try:
            opcode,payload = ws_read(stream)
            assert opcode == 8,(opcode,payload)
        except EOFError:
            pass
        settle(completed)
        stream.close()
        sock.close()

        # Client cancellation after delivered output is settled once, not refunded.
        Upstream.entered.clear()
        Upstream.released.clear()
        connection,response = post('hold-cancel')
        assert Upstream.entered.wait(5)
        assert b'response.created' in response.readline()
        response.close()
        connection.close()
        Upstream.released.set()
        completed += 1
        settle(completed)

        # A held stream proves incremental delivery and real process graceful drain.
        Upstream.entered.clear()
        Upstream.released.clear()
        connection,response = post('hold-drain')
        assert Upstream.entered.wait(5)
        assert b'response.created' in response.readline()
        command('docker','kill','--signal','TERM',app)
        assert command('docker','inspect','-f','{{.State.Running}}',app) == 'true'
        Upstream.released.set()
        assert b'response.completed' in response.read()
        connection.close()
        completed += 1
        eventually(lambda: command('docker','inspect','-f','{{.State.Running}}',app)=='false','Go drain exit')
        assert command('docker','inspect','-f','{{.State.ExitCode}}',app)=='0',command('docker','inspect','-f','{{json .State}}',app)
        settle(completed)
        port = start()

        # Sidecar restart terminates a held generation, never replays it.
        before = Upstream.attempts
        Upstream.entered.clear()
        Upstream.released.clear()
        connection,response = post('hold-restart')
        assert Upstream.entered.wait(5)
        assert b'response.created' in response.readline()
        command('docker','restart',sidecar)
        try:
            body = response.read()
        except http.client.IncompleteRead as error:
            body = error.partial
        assert b'response.completed' not in body
        connection.close()
        Upstream.released.set()
        completed += 1
        settle(completed)
        assert Upstream.attempts == before+1
        connection,response = post()
        assert b'response.completed' in response.read()
        connection.close()
        completed += 1
        settle(completed)

        # Application shutdown terminalizes an active WS generation once.
        Upstream.entered.clear()
        Upstream.released.clear()
        sock,stream = connect_websocket(port)
        ws_send(sock,json.dumps({'type':'response.create','model':'deployment-model','input':'hold-ws-shutdown','max_output_tokens':10}),mask=True)
        assert Upstream.entered.wait(5)
        opcode,payload=ws_read(stream)
        assert opcode==1 and json.loads(payload)['type']=='response.created'
        command('docker','kill','--signal','TERM',app)
        eventually(lambda: command('docker','inspect','-f','{{.State.Running}}',app)=='false','active WS application shutdown',20)
        Upstream.released.set()
        stream.close()
        sock.close()
        completed += 1
        settle(completed)
        port=start()

        # Expired graceful deadline must still terminalize an in-flight generation.
        Upstream.entered.clear()
        Upstream.released.clear()
        connection,response = post('hold-go-deadline')
        assert Upstream.entered.wait(5)
        assert b'response.created' in response.readline()
        stopper=subprocess.Popen(['docker','stop',app],stdout=subprocess.DEVNULL)
        eventually(lambda: command('docker','inspect','-f','{{.State.Running}}',app)=='false','Go expired drain deadline exit',SHUTDOWN_SECONDS+20)
        assert stopper.wait(timeout=5)==0
        assert command('docker','inspect','-f','{{.State.ExitCode}}',app)=='0',command('docker','inspect','-f','{{json .State}}',app)
        try:
            body=response.read()
        except http.client.IncompleteRead as error:
            body=error.partial
        assert b'response.completed' not in body
        response.close()
        connection.close()
        Upstream.released.set()
        completed += 1
        settle(completed)

        # Explicit immutable-config rollback: stop sidecar entirely, new Go process off.
        command('docker','stop',app)
        command('docker','stop',sidecar)
        port = start(False)
        connection,response = post()
        assert b'response.completed' in response.read()
        connection.close()
        completed += 1
        settle(completed)
        assert Upstream.attempts == completed,(Upstream.attempts,completed)
        print('PASS unbatched image: HTTP/SSE, two-round WS, graceful Go drain, sidecar restart/no replay, explicit off rollback; exact accounting',flush=True)
        command('docker','stop',app)

        # The delivered base Compose enables batching. A 1h interval makes final
        # shutdown flush, not a coincidental periodic tick, responsible for durability.
        command('docker','start',sidecar)
        port=start(batch=True)
        before_batch=completed
        for _ in range(2):
            connection,response=post()
            assert b'response.completed' in response.read()
            connection.close()
            completed += 1
        def batch_pending():
            row,token,channel,logs=json.loads(command('docker','exec',resource_name,'python3','/fixture/test.py','--accounting'))
            return len(logs)==completed and row[1:]==[before_batch*1000,before_batch] and channel==before_batch*1000
        eventually(batch_pending,'completed requests retained pending batch counters before 1h tick')
        command('docker','stop',app)
        assert command('docker','inspect','-f','{{.State.ExitCode}}',app)=='0',command('docker','inspect','-f','{{json .State}}',app)
        settle(completed)
        print('PASS batch=true completed requests flushed at graceful exit before periodic tick',flush=True)

        port=start(batch=True)
        Upstream.entered.clear()
        Upstream.released.clear()
        connection,response=post('hold-batch-deadline')
        assert Upstream.entered.wait(5)
        assert b'response.created' in response.readline()
        stopper=subprocess.Popen(['docker','stop',app],stdout=subprocess.DEVNULL)
        eventually(lambda: command('docker','inspect','-f','{{.State.Running}}',app)=='false','batched forced deadline drain+flush',SHUTDOWN_SECONDS+25)
        assert stopper.wait(timeout=5)==0
        assert command('docker','inspect','-f','{{.State.ExitCode}}',app)=='0',command('docker','inspect','-f','{{json .State}}',app)
        try:
            body=response.read()
        except http.client.IncompleteRead as error:
            body=error.partial
        assert b'response.completed' not in body
        response.close()
        connection.close()
        Upstream.released.set()
        completed += 1
        settle(completed)
        assert Upstream.attempts==completed,(Upstream.attempts,completed)
        print('PASS batch=true forced-deadline terminal accounting flushed before process exit; no replay',flush=True)
    except Exception:
        print(command('docker','inspect','-f','{{json .State}}',app,check=False))
        print(command('docker','logs','--tail','40',app,check=False))
        raise
    finally:
        Upstream.released.set()
        if upstream:
            upstream.shutdown()
        command('docker','rm','-f',app,sidecar,resource_name,check=False)
        command('docker','volume','rm',volume,data_volume,fixture_volume,check=False)
        shutil.rmtree(scratch,ignore_errors=True)


if __name__ == '__main__':
    if sys.argv[1:] == ['--resource-client']:
        resource_client()
    elif sys.argv[1:] == ['--seed']:
        seed_database()
    elif sys.argv[1:] == ['--accounting']:
        database=sqlite3.connect('/data/deployment.db')
        row=database.execute('SELECT quota,used_quota,request_count FROM users WHERE id=9001').fetchone()
        token=database.execute('SELECT remain_quota,used_quota FROM tokens WHERE id=9001').fetchone()
        channel=database.execute('SELECT used_quota FROM channels WHERE id=9001').fetchone()[0]
        logs=database.execute('SELECT quota FROM logs WHERE token_id=9001 AND type=2 ORDER BY id').fetchall()
        print(json.dumps([row,token,channel,logs]))
    else:
        main()
