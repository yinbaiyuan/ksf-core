#!/usr/bin/python3
"""Use launchd's loopback listener, then exec KSF as the configured normal user.

The system LaunchDaemon binds port 80 and starts this helper with UserName set.
No proxy, elevated KSF process, or third-party Python modules are involved.
"""
import ctypes
import os
import sys


def main():
    if len(sys.argv) not in (2, 3) or not os.path.isabs(sys.argv[1]):
        raise SystemExit('Expected the absolute KSF launcher path and optional port.')
    if os.geteuid() == 0:
        raise SystemExit('Configure the LaunchDaemon UserName; KSF must not run as root.')
    library = ctypes.CDLL('/usr/lib/libSystem.B.dylib')
    activate = library.launch_activate_socket
    activate.argtypes = [ctypes.c_char_p, ctypes.POINTER(ctypes.POINTER(ctypes.c_int)), ctypes.POINTER(ctypes.c_size_t)]
    activate.restype = ctypes.c_int
    descriptors = ctypes.POINTER(ctypes.c_int)()
    count = ctypes.c_size_t()
    error = activate(b'Web', ctypes.byref(descriptors), ctypes.byref(count))
    if error or count.value != 1:
        raise SystemExit('Cannot activate the single launchd Web socket: %s (%s).' % (error, count.value))
    descriptor = descriptors[0]
    library.free.argtypes = [ctypes.c_void_p]
    library.free(descriptors)
    os.set_inheritable(descriptor, True)
    os.environ['KSF_WEB_LISTEN_FD'] = str(descriptor)
    launcher = sys.argv[1]
    arguments = [launcher, 'web', '--json']
    if len(sys.argv) == 3:
        arguments += ['--port', sys.argv[2]]
    os.execv(launcher, arguments)


if __name__ == '__main__':
    main()
