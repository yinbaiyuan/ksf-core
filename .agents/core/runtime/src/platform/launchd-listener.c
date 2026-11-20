#include <launch.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <fcntl.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

/* launchd binds the loopback socket; KSF receives the listening descriptor,
 * never an accepted/proxied connection, and continues as the login user. */
int main(int argc, char **argv) {
    int *fds = NULL;
    size_t count = 0;
    int error = launch_activate_socket("Workbench", &fds, &count);
    if (argc < 2 || error || count != 1) {
        fprintf(stderr, "KSF launchd listener unavailable (%d, %zu)\n", error, count);
        return 1;
    }
    struct sockaddr_in address;
    socklen_t size = sizeof(address);
    if (getsockname(fds[0], (struct sockaddr *)&address, &size) ||
        address.sin_family != AF_INET || ntohl(address.sin_addr.s_addr) != INADDR_LOOPBACK) {
        fprintf(stderr, "KSF listener must be IPv4 loopback\n");
        return 1;
    }
    if (fds[0] != 3 && dup2(fds[0], 3) < 0) return 1;
    if (fds[0] != 3) close(fds[0]);
    free(fds);
    if (fcntl(3, F_SETFD, 0) < 0 || setenv("KSF_WEB_LISTEN_FD", "3", 1)) return 1;
    execv(argv[1], argv + 1);
    perror("KSF launcher exec");
    return 1;
}
