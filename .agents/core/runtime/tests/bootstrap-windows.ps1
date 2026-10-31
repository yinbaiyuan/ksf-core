#Requires -Version 5.1
param([string] $Root = ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))))
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$OutputEncoding=[Text.UTF8Encoding]::new($false)
$checks=0
function Assert-Check($Condition,[string]$Message){if(-not $Condition){throw "Bootstrap check failed: $Message"};$script:checks++}
function PS-Quote([string]$Value){return "'"+$Value.Replace("'","''")+"'"}
$shell=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('ksf 引导 空格 '+[Guid]::NewGuid().ToString('N'))
$savedPath=$env:PATH
$savedArchitecture=$env:PROCESSOR_ARCHITECTURE
Remove-Item Env:PROCESSOR_ARCHITECTURE -ErrorAction SilentlyContinue
$env:PATH=(Join-Path $env:SystemRoot 'System32')+';'+(Split-Path $shell)
function Start-Fixture([string[]]$Arguments,[string]$InputText='',[switch]$KeepInputOpen,[switch]$DirectFile){
    $launcher=Join-Path $fixture '.agents/ksf.ps1'
    $script="function Get-FileHash { throw 'Bootstrap must hash without external cmdlet discovery' }; `$ksfFixtureArguments=@("+(($Arguments | ForEach-Object {PS-Quote $_}) -join ',')+"); & $(PS-Quote $launcher) @ksfFixtureArguments; exit `$LASTEXITCODE"
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$shell;$info.Arguments=if($DirectFile){'-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File '+[char]34+$launcher+[char]34+' query'}else{'-NoLogo -NoProfile -NonInteractive -EncodedCommand '+[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))};$info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true;$info.RedirectStandardInput=$true;$info.WorkingDirectory=[IO.Path]::GetTempPath()
    $info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false);$info.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
    $process=[Diagnostics.Process]::Start($info);$inputBytes=[Text.Encoding]::UTF8.GetBytes($InputText);$process.StandardInput.BaseStream.Write($inputBytes,0,$inputBytes.Length);$process.StandardInput.BaseStream.Flush();if(-not $KeepInputOpen){$process.StandardInput.Close()};return $process
}
function Finish-Fixture($Process){try{$stdout=$Process.StandardOutput.ReadToEnd();$stderr=$Process.StandardError.ReadToEnd();$Process.WaitForExit();return @{Code=$Process.ExitCode;Out=$stdout;Error=$stderr}}finally{$Process.Dispose()}}
function Invoke-Fixture([string[]]$Arguments,[string]$InputText=''){return Finish-Fixture (Start-Fixture $Arguments $InputText)}
try{
    [void][IO.Directory]::CreateDirectory((Join-Path $fixture '.agents/core/runtime/src'))
    [void][IO.Directory]::CreateDirectory((Join-Path $fixture '.agents/core/runtime/packages'))
    foreach($relative in @('.agents/ksf.ps1','.agents/core/runtime/bootstrap.ps1','.agents/core/manifest.yaml')){[IO.File]::Copy((Join-Path $Root $relative),(Join-Path $fixture $relative))}
    $archive=Join-Path $fixture '.agents/core/runtime/packages/node-v24.21.0-win-x64.zip'
    [IO.File]::Copy((Join-Path $Root '.agents/core/runtime/packages/node-v24.21.0-win-x64.zip'),$archive)
    $source=@'
if(process.argv[2]==='query'){console.log(JSON.stringify({ok:true}));process.exit(0);}
let stdin='';for await(const chunk of process.stdin)stdin+=chunk;
const args=process.argv.slice(2);if(args[0]==='runtime'&&process.env.KSF_BOOTSTRAP_VERIFIED!=='1')process.exit(9);
console.log(JSON.stringify({args,stdin,version:process.version,node:process.execPath,root:process.env.KSF_ROOT}));
if(args[0]==='exit')process.exit(Number(args[1]));
'@
    [IO.File]::WriteAllText((Join-Path $fixture '.agents/core/runtime/src/cli.js'),$source,[Text.UTF8Encoding]::new($false))
    $result=Invoke-Fixture @('runtime','verify','--json');Assert-Check ($result.Code -eq 0) "first boot: $($result.Error)"
    $data=$result.Out | ConvertFrom-Json;Assert-Check ($data.version -ceq 'v24.21.0' -and $data.node.StartsWith($fixture)) 'exact bundled Node without global Node'
    $node=$data.node
    # A scanner or executable image mapping can temporarily deny a directory
    # rename after extraction. Exercise a real sharing violation beyond 2s.
    $moveSource=Join-Path $fixture 'move-source';$moveTarget=Join-Path $fixture 'move-target'
    [void][IO.Directory]::CreateDirectory($moveSource)
    $moveFile=Join-Path $moveSource 'held.txt';[IO.File]::WriteAllText($moveFile,'preserve bytes')
    $held=[IO.File]::Open($moveFile,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
    $moveScript=". $(PS-Quote (Join-Path $Root '.agents/core/runtime/bootstrap.ps1')); Move-KsfRuntimeDirectory $(PS-Quote $moveSource) $(PS-Quote $moveTarget)"
    $moveInfo=New-Object Diagnostics.ProcessStartInfo
    $moveInfo.FileName=$shell;$moveInfo.Arguments='-NoLogo -NoProfile -NonInteractive -EncodedCommand '+[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($moveScript));$moveInfo.UseShellExecute=$false;$moveInfo.CreateNoWindow=$true;$moveInfo.RedirectStandardError=$true
    $moving=[Diagnostics.Process]::Start($moveInfo)
    try{
        Start-Sleep -Milliseconds 3500
        Assert-Check (-not $moving.HasExited -and [IO.Directory]::Exists($moveSource) -and -not [IO.Directory]::Exists($moveTarget)) 'sharing violation preserves the source while waiting'
        $held.Dispose();$held=$null
        Assert-Check ($moving.WaitForExit(15000)) 'directory publication completes after the handle is released'
        Assert-Check ($moving.ExitCode -eq 0 -and [IO.File]::ReadAllText((Join-Path $moveTarget 'held.txt')) -ceq 'preserve bytes') "transient directory sharing conflict is retried: $($moving.StandardError.ReadToEnd())"
    }finally{if($null -ne $held){$held.Dispose()};if(-not $moving.HasExited){$moving.Kill();$moving.WaitForExit()};$moving.Dispose()}
    $arguments=@('hello','','中文 空格','double"quote','tail\',"single'quote")
    $result=Invoke-Fixture $arguments 'UTF8 输入';Assert-Check ($result.Code -eq 0) 'argument and stdin command succeeds'
    $data=$result.Out | ConvertFrom-Json
    Assert-Check (($data.args | ConvertTo-Json -Compress) -ceq ($arguments | ConvertTo-Json -Compress)) "all arguments including empty strings and trailing backslash survive: $($data.args | ConvertTo-Json -Compress)"
    Assert-Check ($data.stdin -ceq 'UTF8 输入') 'UTF-8 standard input survives the native bridge'
    Assert-Check ((Invoke-Fixture @('exit','7')).Code -eq 7) 'business exit status preserved'
    $open=Start-Fixture @('query') '' -KeepInputOpen
    try{Assert-Check ($open.WaitForExit(5000)) 'a CLI query does not consume an unused native stdin pipe'}finally{$open.StandardInput.Close()}
    $openResult=Finish-Fixture $open;Assert-Check ($openResult.Code -eq 0) 'unused native stdin does not change exit status'
    $direct=Start-Fixture @('query') '' -KeepInputOpen -DirectFile
    try{Assert-Check ($direct.WaitForExit(5000)) 'direct PowerShell -File does not enumerate an unused native pipe'}finally{$direct.StandardInput.Close()}
    $directResult=Finish-Fixture $direct;Assert-Check ($directResult.Code -eq 0) 'direct -File query preserves status'

    $pipelineScript="'pipeline UTF8 输入' | & $(PS-Quote (Join-Path $fixture '.agents/ksf.ps1')) hello | ConvertFrom-Json | ConvertTo-Json -Compress"
    $pipeline=& $shell -NoLogo -NoProfile -NonInteractive -EncodedCommand ([Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($pipelineScript)))
    $pipelineData=$pipeline | ConvertFrom-Json
    Assert-Check ($pipelineData.stdin -ceq 'pipeline UTF8 输入') "PowerShell pipeline input and output compose with native CLI: $($pipelineData | ConvertTo-Json -Compress)"

    [IO.File]::WriteAllText($node,'damaged executable')
    $result=Invoke-Fixture @('runtime','verify','--json');Assert-Check ($result.Code -eq 0) "damaged executable repaired: $($result.Error)"
    $originalArchive="$archive.saved";[IO.File]::Move($archive,$originalArchive)
    Assert-Check ((Invoke-Fixture @('hello')).Code -eq 0) 'quick start reuses healthy installed runtime without archive'
    $result=Invoke-Fixture @('runtime','verify','--json');Assert-Check ($result.Code -ne 0 -and $result.Error.Contains('ARCHIVE_MISSING')) 'full verification still requires archive'
    [IO.File]::Move($originalArchive,$archive)
    $record=Join-Path (Split-Path $node) '.install-record';[IO.File]::WriteAllText($record,'broken record')
    Assert-Check ((Invoke-Fixture @('runtime','verify','--json')).Code -eq 0) 'corrupt installation record is rebuilt from verified bytes'
    $first=Start-Fixture @('runtime','verify','--json');$second=Start-Fixture @('runtime','verify','--json')
    $a=Finish-Fixture $first;$b=Finish-Fixture $second
    Assert-Check ($a.Code -eq 0 -and $b.Code -eq 0) 'concurrent verification is serialized'
    Write-Output "Windows bootstrap checks passed: $checks"
}finally{
    $env:PATH=$savedPath
    if($savedArchitecture){$env:PROCESSOR_ARCHITECTURE=$savedArchitecture}
    for($attempt=0;$attempt -lt 10;$attempt++){try{if([IO.Directory]::Exists($fixture)){Remove-Item -LiteralPath $fixture -Recurse -Force};break}catch{if($attempt -eq 9){throw};Start-Sleep -Milliseconds 250}}
}
