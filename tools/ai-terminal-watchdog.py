#!/usr/bin/env python3
"""Crash cleanup only: inherited liveness pipe closes even on worker SIGKILL."""
import os,pathlib,shutil,signal,subprocess,sys
scope,session,proxy_pid=sys.argv[1],pathlib.Path(sys.argv[2]),int(sys.argv[3])
if not scope.startswith('fred-ai-') or not scope[8:].isalnum():sys.exit(2)
expected=pathlib.Path.home()/'.local/share/fred-ai/sessions'
if session.parent!=expected or not session.name.startswith('session-'):sys.exit(2)
try:
    while os.read(0,64):pass
finally:
    for action in (['kill','--kill-whom=all','--signal=SIGKILL'],['stop']):
        try:subprocess.run(['/usr/bin/systemctl','--user',*action,scope+'.scope'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=5)
        except (OSError,subprocess.TimeoutExpired):pass
    try:os.killpg(proxy_pid,signal.SIGKILL)
    except ProcessLookupError:pass
    shutil.rmtree(session,ignore_errors=True)
