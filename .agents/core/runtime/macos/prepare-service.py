#!/usr/bin/python3
"""Prepare (without installing) the current user's KSF launchd service."""
import os
from pathlib import Path
import plistlib
import pwd
import shlex
import shutil
import sys


def main():
    if sys.platform != 'darwin' or os.geteuid() == 0:
        raise SystemExit('Run this preparation as the normal KSF user on macOS.')
    root = Path(__file__).resolve().parents[4]
    stage = root / '.agents/runtime-data/web-service'
    stage.mkdir(parents=True, exist_ok=True)
    account = pwd.getpwuid(os.getuid())
    helper = '/Library/Application Support/KSF/workbench-launch.py'
    target = '/Library/LaunchDaemons/com.ksf.workbench.plist'
    config = {
        'Label': 'com.ksf.workbench',
        'UserName': account.pw_name,
        'ProgramArguments': ['/usr/bin/python3', '-I', helper, str(root / '.agents/ksf')],
        'WorkingDirectory': str(root),
        'EnvironmentVariables': {'HOME': account.pw_dir, 'PATH': '/usr/bin:/bin:/usr/sbin:/sbin'},
        'RunAtLoad': True, 'KeepAlive': True, 'ThrottleInterval': 10,
        'Sockets': {'Web': {'SockNodeName': '127.0.0.1', 'SockServiceName': 80, 'SockFamily': 'IPv4', 'SockType': 'stream'}},
        'StandardOutPath': str(stage / 'web.log'), 'StandardErrorPath': str(stage / 'web.err'),
    }
    config_path = stage / 'com.ksf.workbench.plist'
    config_path.write_bytes(plistlib.dumps(config))
    shutil.copyfile(Path(__file__).with_name('workbench-launch.py'), stage / 'workbench-launch.py')
    for name in ['web.log', 'web.err']:
        (stage / name).touch(exist_ok=True)
    quote = shlex.quote
    script = '\n'.join([
        '#!/bin/sh', 'set -eu',
        'test ! -e ' + quote(target), 'test ! -e ' + quote(helper),
        quote(str(root / '.agents/ksf')) + ' web hosts --apply --json',
        '/usr/bin/install -d -o root -g wheel -m 755 ' + quote(str(Path(helper).parent)),
        '/usr/bin/install -o root -g wheel -m 644 ' + quote(str(stage / 'workbench-launch.py')) + ' ' + quote(helper),
        '/usr/bin/install -o root -g wheel -m 644 ' + quote(str(config_path)) + ' ' + quote(target),
        '/bin/launchctl bootstrap system ' + quote(target), '',
    ])
    installer = stage / 'install.sh'
    installer.write_text(script)
    installer.chmod(0o700)
    print('Prepared: %s\nReview, then install with administrator permission: sudo /bin/sh %s' % (config_path, quote(str(installer))))


if __name__ == '__main__':
    main()
