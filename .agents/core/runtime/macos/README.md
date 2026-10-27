# macOS 工作台服务

默认直接监听 `127.0.0.1:80`，通过 hosts 映射使用 `http://ksf.ai/`。系统 launchd 分配受保护端口，工作台以配置中的普通用户运行；没有代理或端口转发。

以实际使用 KSF 的普通用户准备安装文件：

```sh
/usr/bin/python3 .agents/core/runtime/macos/prepare-service.py
```

检查 `.agents/runtime-data/web-service/com.ksf.workbench.plist`、`workbench-launch.py` 与 `install.sh`，再授权安装：

```sh
sudo /bin/sh .agents/runtime-data/web-service/install.sh
```

安装先补充缺失的 IPv4 与映射 IPv6 回环 hosts 条目（`127.0.0.1 ksf.ai`、`::ffff:127.0.0.1 ksf.ai`），再复制 root 所有的辅助程序到 `/Library/Application Support/KSF/`，将本实例服务定义安装到 `/Library/LaunchDaemons/com.ksf.workbench.plist` 并启动。已有同名定义或辅助程序时拒绝覆盖。首次打开及登录后服务自动保持运行；日志保存在当前实例 `.agents/runtime-data/web-service/web.log` 和 `web.err`。工作台读取当前 Core 源码，源码变更后重启服务：

```sh
sudo launchctl kickstart -k system/com.ksf.workbench
```

检查 `http://ksf.ai/api/health` 与服务进程用户。默认前台 `.agents/ksf web` 在该服务运行时会报告 80 已占用；未安装服务且无受保护端口权限时报告 `WEB_PORT_PERMISSION_REQUIRED`。需要临时测试时可显式指定其他端口。已有服务只需补 hosts 时，执行 `sudo .agents/ksf web hosts --apply --json`，不必重装服务。

卸载时先停止服务、释放监听 socket，再删除这两个已安装文件：

```sh
sudo launchctl bootout system/com.ksf.workbench
sudo rm /Library/LaunchDaemons/com.ksf.workbench.plist
sudo rm '/Library/Application Support/KSF/workbench-launch.py'
```

实例移动后先卸载，再从新位置重新准备和安装，避免旧绝对路径失效。本机制要求 macOS 自带的 Python 3（或已安装 Command Line Tools）；不下载依赖，不修改计算机名称或防火墙。卸载服务不会自动删除 hosts 条目；不再需要时只删除 KSF 对应的映射，保留其他条目。
