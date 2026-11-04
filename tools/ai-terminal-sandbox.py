#!/usr/bin/env python3
"""Private terminal worker. stdin/stdout are strict NDJSON, never diagnostic logs."""
import base64,collections,fcntl,json,os,pathlib,pty,select,signal,struct,subprocess,sys,tempfile,time,uuid
TOOLS=pathlib.Path(__file__).resolve().parent
CLAUDE=pathlib.Path.home()/'.local/share/fred-ai/runtime/claude-2.1.318/node_modules'
MAX_LINE=8192

def message(kind,**fields):return (json.dumps({'type':kind,**fields},separators=(',',':'))+'\n').encode()
def dimensions(value):
    if type(value) is not int or not 20<=value<=300:raise ValueError('dimensions')
    return value

def sandbox_command(socket_path,provider,scope,probe=None):
    args=['/usr/bin/systemd-run','--user','--scope','--quiet','--unit='+scope,'-p','CPUQuota=50%','-p','MemoryMax=1536M','-p','MemorySwapMax=0','-p','TasksMax=128','--','/usr/bin/bwrap','--unshare-all','--die-with-parent','--new-session','--cap-drop','ALL','--clearenv','--ro-bind','/usr','/usr','--symlink','usr/bin','/bin','--symlink','usr/sbin','/sbin','--symlink','usr/lib','/lib','--symlink','usr/lib64','/lib64','--proc','/proc','--dev','/dev','--dir','/etc','--dir','/etc/ssl','--dir','/etc/ssl/certs','--ro-bind','/etc/ssl/certs/ca-certificates.crt','/etc/ssl/certs/ca-certificates.crt','--dir','/run','--ro-bind',str(socket_path),'/run/fred-proxy.sock','--dir','/home','--size',str(128*1024*1024),'--tmpfs','/home/fred','--size',str(256*1024*1024),'--tmpfs','/workspace','--size',str(128*1024*1024),'--tmpfs','/tmp','--dir','/opt','--dir','/opt/fred-ai','--ro-bind',str(TOOLS/'ai-terminal-inner.py'),'/opt/fred-ai/ai-terminal-inner.py','--chdir','/workspace']
    if provider=='claude':args+=['--ro-bind',str(CLAUDE),'/opt/claude-runtime']
    env={'HOME':'/home/fred','CODEX_HOME':'/home/fred/.codex','CLAUDE_CONFIG_DIR':'/home/fred/.claude','PATH':'/usr/bin:/bin','TERM':'xterm-256color','LANG':'C.UTF-8','TMPDIR':'/tmp','HTTPS_PROXY':'http://127.0.0.1:18080','HTTP_PROXY':'http://127.0.0.1:18080','https_proxy':'http://127.0.0.1:18080','http_proxy':'http://127.0.0.1:18080','NO_PROXY':'','NODE_USE_ENV_PROXY':'1','DISABLE_AUTOUPDATER':'1','CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC':'1'}
    for name,value in env.items():args+=['--setenv',name,value]
    if probe:args+=['--ro-bind',str(probe),'/opt/fred-ai/probe.py']
    args+=['--remount-ro','/','--remount-ro','/dev']
    if probe:args+=['/usr/bin/python3','/opt/fred-ai/probe.py']
    else:args+=['/usr/bin/python3','/opt/fred-ai/ai-terminal-inner.py',provider]
    return args

def cleanup_scope(scope):
    for action in (['kill','--kill-whom=all','--signal=SIGKILL'],['stop']):
        try:subprocess.run(['/usr/bin/systemctl','--user',*action,scope+'.scope'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=5)
        except (OSError,subprocess.TimeoutExpired):pass

def interrupted(_signum,_frame):raise SystemExit(0)

def main():
    for signum in (signal.SIGHUP,signal.SIGTERM,signal.SIGINT):signal.signal(signum,interrupted)
    child=proxy=watchdog=None;liveness=None;master=slave=None;scope='fred-ai-'+uuid.uuid4().hex;session=None
    queue=collections.deque();queued=0;buffer=b'';input_pending=bytearray();started=False;ending=False;exit_code=0;deadline=time.monotonic()+1800
    def emit(kind,**fields):
        nonlocal queued
        data=message(kind,**fields);queue.append(data);queued+=len(data)
    os.set_blocking(0,False);os.set_blocking(1,False)
    try:
        while True:
            if time.monotonic()>deadline:raise ValueError('lifetime')
            if queued>512*1024:raise ValueError('backpressure')
            readers=[0]+([master] if master is not None and not ending else [])
            writers=([1] if queue else [])+([master] if master is not None and input_pending and not ending else [])
            ready,writable,_=select.select(readers,writers,[],.1)
            if master is not None and master in writable:
                try:del input_pending[:os.write(master,input_pending)]
                except BlockingIOError:pass
            if 1 in writable:
                try:
                    sent=os.write(1,queue[0]);queued-=sent
                    if sent==len(queue[0]):queue.popleft()
                    else:queue[0]=queue[0][sent:]
                except BlockingIOError:pass
            if 0 in ready:
                chunk=os.read(0,4096)
                if not chunk:break
                buffer+=chunk
                if len(buffer)>MAX_LINE:raise ValueError('input_limit')
                while b'\n' in buffer:
                    line,buffer=buffer.split(b'\n',1)
                    data=json.loads(line)
                    if type(data) is not dict or type(data.get('type')) is not str:raise ValueError('protocol')
                    kind=data['type']
                    if kind=='start' and not started and set(data)=={'type','provider','cols','rows'}:
                        provider=data['provider'];cols=dimensions(data['cols']);rows=dimensions(data['rows'])
                        if provider not in ('codex','claude'):raise ValueError('provider')
                        if provider=='claude' and not CLAUDE.is_dir():raise ValueError('runtime_unavailable')
                        root=pathlib.Path.home()/'.local/share/fred-ai/sessions';root.mkdir(parents=True,exist_ok=True,mode=0o700)
                        session=tempfile.TemporaryDirectory(prefix='session-',dir=root);socket_path=pathlib.Path(session.name)/'proxy.sock'
                        proxy=subprocess.Popen(['/usr/bin/node',str(TOOLS/'ai-terminal-proxy.mjs'),str(socket_path),provider],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,env={'PATH':'/usr/bin:/bin','HOME':'/nonexistent'},start_new_session=True)
                        if not select.select([proxy.stdout],[],[],5)[0] or proxy.stdout.readline(64)!=b'ready\n':raise ValueError('proxy_unavailable')
                        read_pipe,liveness=os.pipe()
                        watchdog=subprocess.Popen(['/usr/bin/python3',str(TOOLS/'ai-terminal-watchdog.py'),scope,session.name,str(proxy.pid)],stdin=read_pipe,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True,close_fds=True)
                        os.close(read_pipe)
                        master,slave=pty.openpty();fcntl.ioctl(slave,0x5414,struct.pack('HHHH',rows,cols,0,0));os.set_blocking(master,False)
                        def terminal_session():
                            os.setsid();fcntl.ioctl(slave,0x540E,0)
                        child=subprocess.Popen(sandbox_command(socket_path,provider,scope),stdin=slave,stdout=slave,stderr=slave,preexec_fn=terminal_session,close_fds=True)
                        os.close(slave);slave=None;started=True;emit('ready',provider=provider,cols=cols,rows=rows)
                    elif kind=='input' and started and not ending and set(data)=={'type','data'}:
                        if type(data['data']) is not str or len(data['data'])>5500:raise ValueError('input_limit')
                        payload=base64.b64decode(data['data'],validate=True)
                        if len(payload)>4096:raise ValueError('input_limit')
                        input_pending.extend(payload)
                        if len(input_pending)>32768:raise ValueError('input_limit')
                    elif kind=='resize' and started and not ending and set(data)=={'type','cols','rows'}:
                        cols=dimensions(data['cols']);rows=dimensions(data['rows']);fcntl.ioctl(master,0x5414,struct.pack('HHHH',rows,cols,0,0))
                    elif kind=='stop' and set(data)=={'type'}:ending=True;cleanup_scope(scope)
                    else:raise ValueError('protocol')
            if master in ready and master is not None:
                try:
                    payload=os.read(master,8192)
                    if payload:emit('output',data=base64.b64encode(payload).decode('ascii'))
                except OSError:pass
            if child is not None and child.poll() is not None and not ending:ending=True
            if ending:
                if not any(b'"type":"exit"' in item for item in queue):
                    emit('exit',code=child.poll() if child is not None and child.poll() is not None else 0)
                while queue:
                    if select.select([],[1],[],2)[1]:
                        sent=os.write(1,queue[0]);queue[0]=queue[0][sent:]
                        if not queue[0]:queue.popleft()
                    else:break
                break
    except (ValueError,TypeError,KeyError,OSError,subprocess.SubprocessError) as error:
        exit_code=1
        try:os.write(1,message('error',code=str(error) if isinstance(error,ValueError) and str(error) in ('protocol','dimensions','provider','runtime_unavailable','input_limit','lifetime','backpressure','proxy_unavailable') else 'worker_failed'))
        except OSError:pass
    finally:
        cleanup_scope(scope)
        if child is not None:
            try:os.killpg(child.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            try:child.wait(timeout=5)
            except subprocess.TimeoutExpired:pass
        for descriptor in (master,slave):
            if descriptor is not None:
                try:os.close(descriptor)
                except OSError:pass
        if proxy is not None:
            proxy.terminate()
            try:proxy.wait(timeout=5)
            except subprocess.TimeoutExpired:proxy.kill();proxy.wait()
        if liveness is not None:os.close(liveness)
        if watchdog is not None:
            try:watchdog.wait(timeout=12)
            except subprocess.TimeoutExpired:watchdog.kill();watchdog.wait()
        if session is not None:session.cleanup()
    return exit_code
if __name__=='__main__':sys.exit(main())
