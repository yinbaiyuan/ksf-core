#Requires -Version 5.1
# Launcher protocol 1. This file contains no Node.js installation logic.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ksfCommandArguments = @($args)
$env:KSF_ROOT = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

function Stop-KsfLauncher([string] $Code, [string] $Message) {
    throw "KSF launcher error [$Code]: $Message"
}
function Assert-KsfPath([string] $Path) {
    $ksfItem = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if ($null -ne $ksfItem -and ($ksfItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        Stop-KsfLauncher 'UNSAFE_PATH' "Symbolic link or junction: $Path"
    }
}
function Assert-KsfTree([string] $Path) {
    Assert-KsfPath $Path
    foreach ($ksfItem in Get-ChildItem -LiteralPath $Path -Force) {
        Assert-KsfPath $ksfItem.FullName
        if ($ksfItem.PSIsContainer) { Assert-KsfTree $ksfItem.FullName }
    }
}
function Test-KsfSameFile([string] $First, [string] $Second) {
    if (-not [IO.File]::Exists($First) -or -not [IO.File]::Exists($Second)) { return $false }
    $ksfHasher = [Security.Cryptography.SHA256]::Create()
    try {
        $ksfFirstHash = [Convert]::ToBase64String($ksfHasher.ComputeHash([IO.File]::ReadAllBytes($First)))
        $ksfSecondHash = [Convert]::ToBase64String($ksfHasher.ComputeHash([IO.File]::ReadAllBytes($Second)))
        return $ksfFirstHash -ceq $ksfSecondHash
    } finally { $ksfHasher.Dispose() }
}
function Restore-KsfTransaction {
    $ksfSystem = Join-Path $env:KSF_ROOT '.agents/runtime-data/system'
    $ksfTransaction = Join-Path $ksfSystem 'transaction'
    Assert-KsfPath $ksfTransaction
    if (-not [IO.Directory]::Exists($ksfTransaction)) { return }
    $ksfLockPath = Join-Path $ksfSystem 'recovery.lock'
    Assert-KsfPath $ksfLockPath
    try {
        $ksfLock = [IO.File]::Open($ksfLockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    } catch { Stop-KsfLauncher 'RECOVERY_BUSY' 'Recovery lock is unavailable; retry after the other recovery finishes.' }
    try {
        if (-not [IO.Directory]::Exists($ksfTransaction)) { return }
        Assert-KsfTree $ksfTransaction
        $ksfProtocolPath = Join-Path $ksfTransaction 'protocol'
        if (-not [IO.File]::Exists($ksfProtocolPath) -or [IO.File]::ReadAllText($ksfProtocolPath).Trim() -cne '1') {
            Stop-KsfLauncher 'RECOVERY_PROTOCOL' 'Unknown or missing recovery protocol; preserve the transaction for repair.'
        }
        $ksfOwnerText = [IO.File]::ReadAllText((Join-Path $ksfTransaction 'owner')).Trim()
        $ksfOwnerStart = [IO.File]::ReadAllText((Join-Path $ksfTransaction 'owner.start')).Trim()
        $ksfOwnerId = 0
        if (-not [int]::TryParse($ksfOwnerText, [ref] $ksfOwnerId) -or $ksfOwnerId -le 0 -or -not $ksfOwnerStart) {
            Stop-KsfLauncher 'JOURNAL_INVALID' 'Missing transaction owner identity.'
        }
        $ksfOwnerProcess = Get-Process -Id $ksfOwnerId -ErrorAction SilentlyContinue
        if ($null -ne $ksfOwnerProcess) {
            # Windows writers record UTC StartTime ticks as a decimal string.
            if ($ksfOwnerProcess.StartTime.ToUniversalTime().Ticks.ToString() -ceq $ksfOwnerStart) {
                Stop-KsfLauncher 'UPDATE_BUSY' 'A system update is running; retry after it finishes.'
            }
        }
        $ksfName = [IO.File]::ReadAllText((Join-Path $ksfTransaction 'name')).Trim()
        if ($ksfName -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') { Stop-KsfLauncher 'JOURNAL_INVALID' 'Invalid transaction name.' }
        if ([IO.File]::Exists((Join-Path $ksfTransaction 'committed'))) {
            $ksfArchive = Join-Path $ksfSystem 'backups'
        } else {
            $ksfArchive = Join-Path $ksfSystem 'failed'
        }
        Assert-KsfPath $ksfArchive
        [void] [IO.Directory]::CreateDirectory($ksfArchive)
        $ksfDestination = Join-Path $ksfArchive $ksfName
        Assert-KsfPath $ksfDestination
        if (Test-Path -LiteralPath $ksfDestination) { Stop-KsfLauncher 'RECOVERY_CONFLICT' 'Transaction archive already exists.' }
        if (-not [IO.File]::Exists((Join-Path $ksfTransaction 'committed'))) {
            $ksfRootFiles = @('AGENTS.md', '.agents/ksf', '.agents/ksf.ps1')
            foreach ($ksfFile in $ksfRootFiles) {
                if (-not [IO.File]::Exists((Join-Path $ksfTransaction "root-intent/$ksfFile"))) { continue }
                $ksfLive = Join-Path $env:KSF_ROOT $ksfFile
                $ksfOld = Join-Path $ksfTransaction "old-root/$ksfFile"
                $ksfNew = Join-Path $ksfTransaction "new-root/$ksfFile"
                Assert-KsfPath $ksfLive
                if (-not [IO.File]::Exists($ksfOld) -or -not [IO.File]::Exists($ksfNew)) {
                    Stop-KsfLauncher 'JOURNAL_INVALID' 'Missing root snapshots.'
                }
                if (-not (Test-KsfSameFile $ksfLive $ksfOld) -and -not (Test-KsfSameFile $ksfLive $ksfNew)) {
                    Stop-KsfLauncher 'RECOVERY_CONFLICT' "Concurrent edit at $ksfFile; files and transaction were preserved."
                }
            }
            $ksfOldCore = Join-Path $ksfTransaction 'old-core'
            $ksfLiveCore = Join-Path $env:KSF_ROOT '.agents/core'
            $ksfFailedCore = Join-Path $ksfTransaction 'failed-core'
            if ([IO.Directory]::Exists($ksfOldCore)) {
                if ([IO.Directory]::Exists($ksfLiveCore)) {
                    if ([IO.Directory]::Exists($ksfFailedCore)) { Stop-KsfLauncher 'RECOVERY_CONFLICT' 'Both live and failed Core exist.' }
                    [IO.Directory]::Move($ksfLiveCore, $ksfFailedCore)
                }
                [IO.Directory]::Move($ksfOldCore, $ksfLiveCore)
            }
            foreach ($ksfFile in $ksfRootFiles) {
                if (-not [IO.File]::Exists((Join-Path $ksfTransaction "root-intent/$ksfFile"))) { continue }
                $ksfLive = Join-Path $env:KSF_ROOT $ksfFile
                $ksfOld = Join-Path $ksfTransaction "old-root/$ksfFile"
                if (Test-KsfSameFile $ksfLive $ksfOld) { continue }
                $ksfTemporary = $ksfLive + '.recover.' + [Guid]::NewGuid().ToString('N')
                try {
                    [IO.File]::Copy($ksfOld, $ksfTemporary, $false)
                    if ([IO.File]::Exists($ksfLive)) { [IO.File]::Replace($ksfTemporary, $ksfLive, [NullString]::Value) }
                    else { [IO.File]::Move($ksfTemporary, $ksfLive) }
                } finally { if ([IO.File]::Exists($ksfTemporary)) { [IO.File]::Delete($ksfTemporary) } }
            }
        }
        [IO.Directory]::Move($ksfTransaction, $ksfDestination)
        if ($ksfArchive -eq (Join-Path $ksfSystem 'failed')) { [Console]::Error.WriteLine('KSF: recovered the previous system after an interrupted update.') }
    } finally { $ksfLock.Dispose() }
}

try {
    foreach ($ksfPath in @('.agents', '.agents/ksf', '.agents/ksf.ps1', '.agents/core', '.agents/runtime-data', '.agents/runtime-data/system')) {
        Assert-KsfPath (Join-Path $env:KSF_ROOT $ksfPath)
    }
    Restore-KsfTransaction
    if ($ksfCommandArguments.Count -gt 0 -and $ksfCommandArguments[0] -ceq 'launcher') {
        if ($ksfCommandArguments.Count -eq 2 -and $ksfCommandArguments[1] -ceq 'recover') { exit 0 }
        [Console]::Error.WriteLine('Usage: ksf.ps1 launcher recover'); exit 2
    }
    $env:KSF_INSTALLED_LAUNCHER = '1'
    $env:KSF_LAUNCHER_PROTOCOL = '1'
    $ksfData = Join-Path $env:KSF_ROOT '.agents/runtime-data'
    [void] [IO.Directory]::CreateDirectory($ksfData)
    $ksfIgnore = Join-Path $ksfData '.gitignore'
    Assert-KsfPath $ksfIgnore
    if (-not [IO.File]::Exists($ksfIgnore)) {
        try {
            $ksfIgnoreStream = [IO.File]::Open($ksfIgnore, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
            try { $ksfBytes = [Text.Encoding]::UTF8.GetBytes("*`n"); $ksfIgnoreStream.Write($ksfBytes, 0, $ksfBytes.Length) }
            finally { $ksfIgnoreStream.Dispose() }
        } catch [IO.IOException] { if (-not [IO.File]::Exists($ksfIgnore)) { throw } }
    }
    foreach ($ksfPath in @('.agents/core/runtime', '.agents/core/runtime/bootstrap.ps1')) { Assert-KsfPath (Join-Path $env:KSF_ROOT $ksfPath) }
    $ksfBootstrap = Join-Path $env:KSF_ROOT '.agents/core/runtime/bootstrap.ps1'
    if (-not [IO.File]::Exists($ksfBootstrap)) {
        Stop-KsfLauncher 'BOOTSTRAP_MISSING' 'Core bootstrap.ps1 is missing. Windows runtime preparation has not been implemented; launcher recovery is available.'
    }
    . $ksfBootstrap
    if ($null -eq (Get-Command ksf_bootstrap_main -CommandType Function -ErrorAction SilentlyContinue)) {
        Stop-KsfLauncher 'BOOTSTRAP_INVALID' 'Core must define ksf_bootstrap_main.'
    }
    $global:LASTEXITCODE = 0
    ksf_bootstrap_main @ksfCommandArguments
    exit $LASTEXITCODE
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
