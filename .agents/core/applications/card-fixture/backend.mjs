export function activate(context){let calls=0;return {call(method){if(method==='crash')process.exit(17);return {pid:process.pid,version:context.version,calls:++calls};}};}
