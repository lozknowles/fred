#!/usr/bin/env python3
"""Owns each proxy and scoped launcher from creation through verified cleanup."""
import fcntl,importlib.util,json,os,pathlib,select,shutil,signal,subprocess,sys,time
TOOLS=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('fred_worker',TOOLS/'ai-terminal-sandbox.py')
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)

def lifecycle_phase(_name):pass

def send(kind,**fields):
    try:os.write(1,worker.message(kind,**fields))
    except OSError:pass

def cancelled():
    if not select.select([0],[],[],0)[0]:return False
    os.read(0,64)
    return True

def group_gone(pid):
    try:os.killpg(pid,0);return False
    except ProcessLookupError:return True

def terminate(process):
    if process is None:return True
    try:os.killpg(process.pid,signal.SIGKILL)
    except ProcessLookupError:pass
    try:process.wait(timeout=1)
    except subprocess.TimeoutExpired:return False
    return group_gone(process.pid)

def supervise(scope,session,provider,slave):
    child=proxy=None;clean=False;code=0;exit_sent=False
    try:
        lifecycle_phase('before-session')
        if cancelled():return
        session.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        session.mkdir(mode=0o700)
        lifecycle_phase('before-proxy')
        if cancelled():return
        proxy=subprocess.Popen(['/usr/bin/node',str(TOOLS/'ai-terminal-proxy.mjs'),str(session/'proxy.sock'),provider],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,env={'PATH':'/usr/bin:/bin','HOME':'/nonexistent'},start_new_session=True)
        lifecycle_phase('after-proxy')
        until=time.monotonic()+5
        while not select.select([proxy.stdout],[],[],.05)[0]:
            if cancelled():return
            if time.monotonic()>until:raise RuntimeError('proxy startup')
        if proxy.stdout.readline(64)!=b'ready\n':raise RuntimeError('proxy startup')
        lifecycle_phase('before-launcher')
        if cancelled():return
        def terminal_session():
            os.setsid();fcntl.ioctl(slave,0x540E,0)
        child=subprocess.Popen(worker.sandbox_command(session/'proxy.sock',provider,scope),stdin=slave,stdout=slave,stderr=slave,preexec_fn=terminal_session,close_fds=True)
        lifecycle_phase('after-launcher')
        os.close(slave);slave=None
        send('ready')
        while child.poll() is None:
            if cancelled():break
            time.sleep(.05)
        if child.poll() is not None:code=child.returncode
    except (OSError,ValueError,RuntimeError,subprocess.SubprocessError):
        code=1;send('error')
    finally:
        # Killing and reaping our own launcher FIRST closes the late-registration
        # race: it cannot register a scope or spawn anything after this barrier.
        until=time.monotonic()+8
        while True:
            child_gone=terminate(child)
            scope_gone=worker.cleanup_scope(scope)
            proxy_gone=terminate(proxy)
            if child_gone and scope_gone and proxy_gone:
                try:
                    shutil.rmtree(session)
                except FileNotFoundError:pass
                except OSError:pass
                clean=not session.exists()
            if clean:break
            if time.monotonic()>until:
                if not exit_sent:send('exit',code=code);send('ended',clean=False);exit_sent=True
                # Stay alive as a quarantined reaper; never abandon resources.
                time.sleep(.5)
            else:time.sleep(.05)
        if slave is not None:
            try:os.close(slave)
            except OSError:pass
        if not exit_sent:send('exit',code=code);send('ended',clean=True)
    return 0

def main():
    if len(sys.argv)!=5:return 2
    scope,session,provider,slave=sys.argv[1],pathlib.Path(sys.argv[2]),sys.argv[3],int(sys.argv[4])
    expected=pathlib.Path.home()/'.local/share/fred-ai/sessions'
    if not scope.startswith('fred-ai-') or len(scope)!=40 or not scope[8:].isalnum():return 2
    if session.parent!=expected or not session.name.startswith('session-') or provider not in ('codex','claude'):return 2
    return supervise(scope,session,provider,slave)
if __name__=='__main__':sys.exit(main())
