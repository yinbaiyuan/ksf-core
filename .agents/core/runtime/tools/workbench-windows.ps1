#Requires -Version 5.1
param([ValidateSet('start','stop','status','run','logs')][string]$Action='start',[int]$Port=4317)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ksfRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$ksfData=Join-Path $ksfRoot '.agents/runtime-data/web'
$recordPath=Join-Path $ksfData 'session.json'
$hasher=[Security.Cryptography.SHA256]::Create()
try{$key=([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($ksfRoot.ToLowerInvariant())))).Replace('-','').Substring(0,16)}finally{$hasher.Dispose()}
$taskName='KSF.Workbench.'+$key
function Read-KsfWebSession {
    if(-not [IO.File]::Exists($recordPath)){return $null}
    $value=[IO.File]::ReadAllText($recordPath) | ConvertFrom-Json
    if($value.schemaVersion -ne 1 -or $value.root.TrimEnd('\') -ine $ksfRoot.TrimEnd('\')){throw 'Workbench record does not belong to this instance.'}
    $owned=Get-Process -Id $value.pid -ErrorAction SilentlyContinue
    if($null -eq $owned -or $owned.StartTime.ToUniversalTime().Ticks.ToString() -cne $value.started){return $null}
    return $value
}
if($Action -eq 'run'){
    [void][IO.Directory]::CreateDirectory($ksfData)
    $details=& (Join-Path $ksfRoot '.agents/ksf.ps1') hello --json | ConvertFrom-Json
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$details.runtime.nodePath;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.WorkingDirectory=$ksfRoot
    $info.Arguments='"'+(Join-Path $ksfRoot '.agents/core/runtime/tools/workbench-host.mjs')+'" "'+$ksfRoot+'" '+$Port
    $process=[Diagnostics.Process]::Start($info)
    try{$process.WaitForExit();exit $process.ExitCode}finally{$process.Dispose()}
}
if($Action -eq 'logs'){Get-Content -LiteralPath (Join-Path $ksfData 'workbench.log') -Encoding UTF8 -Tail 80 -Wait;exit 0}
$session=Read-KsfWebSession
if($Action -eq 'status'){if($session){$session | ConvertTo-Json}else{Write-Output 'Workbench is stopped.'};exit 0}
$scheduler=New-Object -ComObject 'Schedule.Service';$scheduler.Connect();$folder=$scheduler.GetFolder('\')
if($Action -eq 'stop'){
    if($session){
        $request=@{schemaVersion=1;pid=$session.pid;nonce=$session.nonce} | ConvertTo-Json -Compress
        [IO.File]::WriteAllText((Join-Path $ksfData 'stop.json'),$request,[Text.UTF8Encoding]::new($false))
        $deadline=[DateTime]::UtcNow.AddSeconds(30)
        while((Read-KsfWebSession) -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 250}
        if(Read-KsfWebSession){throw 'Graceful stop did not finish; inspect the owned service log.'}
    }
    if(@($folder.GetTasks(0) | Where-Object {$_.Name -eq $taskName}).Count){$folder.DeleteTask($taskName,0)}
    Write-Output 'Workbench stopped.';exit 0
}
if($session){Write-Output $session.url;exit 0}
if(@($folder.GetTasks(0) | Where-Object {$_.Name -eq $taskName}).Count){
    $existing=$folder.GetTask($taskName)
    if($existing.State -eq 4){throw 'A start is already in progress; inspect status and logs.'}
    $folder.DeleteTask($taskName,0)
}
$definition=$scheduler.NewTask(0)
$definition.RegistrationInfo.Description='KSF manual workbench; no startup or login trigger.'
$definition.Principal.UserId=[Security.Principal.WindowsIdentity]::GetCurrent().Name;$definition.Principal.LogonType=3;$definition.Principal.RunLevel=0
$definition.Settings.AllowDemandStart=$true;$definition.Settings.ExecutionTimeLimit='PT0S';$definition.Settings.DisallowStartIfOnBatteries=$false;$definition.Settings.StopIfGoingOnBatteries=$false
$native=$definition.Actions.Create(0);$native.Path=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$script="& '"+$PSCommandPath.Replace("'","''")+"' -Action run -Port $Port; exit `$LASTEXITCODE"
$native.Arguments='-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand '+[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
$task=$folder.RegisterTaskDefinition($taskName,$definition,2,$null,$null,3);[void]$task.Run($null)
$deadline=[DateTime]::UtcNow.AddSeconds(30)
while([DateTime]::UtcNow -lt $deadline){$session=Read-KsfWebSession;if($session){Write-Output $session.url;exit 0};Start-Sleep -Milliseconds 250}
throw "Workbench did not become ready; inspect $ksfData\workbench.log"
