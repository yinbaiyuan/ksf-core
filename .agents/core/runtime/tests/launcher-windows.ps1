#Requires -Version 5.1
# Native Windows launcher contract tests. No Node.js, Git, or package install.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ksfRepository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$ksfTestRoots = @()
$ksfChecks = 0
function Assert-KsfTest([bool] $Condition, [string] $Label) {
    if (-not $Condition) { throw "FAILED: $Label" }
    $script:ksfChecks++
    Write-Output "PASS: $Label"
}
function Write-KsfFixture([string] $Root, [string] $Path, [string] $Content) {
    $ksfTarget = Join-Path $Root $Path
    [void] [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($ksfTarget))
    [IO.File]::WriteAllText($ksfTarget, $Content, (New-Object Text.UTF8Encoding $false))
}
function New-KsfFixture {
    $ksfName = 'ksf launcher ' + [char] 0x4E2D + [char] 0x6587 + ' ' + [Guid]::NewGuid().ToString('N')
    $ksfRoot = Join-Path ([IO.Path]::GetTempPath()) $ksfName
    [void] [IO.Directory]::CreateDirectory((Join-Path $ksfRoot '.agents'))
    foreach ($ksfEntry in @('ksf', 'ksf.ps1')) { [IO.File]::Copy((Join-Path $ksfRepository ".agents/$ksfEntry"), (Join-Path $ksfRoot ".agents/$ksfEntry")) }
    Write-KsfFixture $ksfRoot 'AGENTS.md' "old agents`n"
    $script:ksfTestRoots += $ksfRoot
    return $ksfRoot
}
function New-KsfJournal([string] $Root) {
    foreach ($ksfEntry in @{ protocol = '1'; owner = '2147483647'; 'owner.start' = 'dead'; name = 'fixture-1' }.GetEnumerator()) {
        Write-KsfFixture $Root ('.agents/runtime-data/system/transaction/' + $ksfEntry.Key) ($ksfEntry.Value + "`n")
    }
}
function Invoke-KsfLauncher([string] $Root, [string[]] $Arguments) {
    $ksfOutput = @(& (Join-Path $Root '.agents/ksf.ps1') @Arguments)
    return [PSCustomObject] @{ Code = $LASTEXITCODE; Output = $ksfOutput }
}
try {
    $ksfRoot = New-KsfFixture
    $ksfResult = Invoke-KsfLauncher $ksfRoot @('launcher', 'recover')
    Assert-KsfTest ($ksfResult.Code -eq 0) 'recovery succeeds with no Core or runtime'
    $ksfResult = Invoke-KsfLauncher $ksfRoot @('hello')
    Assert-KsfTest ($ksfResult.Code -eq 1) 'missing Windows bootstrap fails explicitly'
    $ksfResult = Invoke-KsfLauncher $ksfRoot @('launcher', 'unknown')
    Assert-KsfTest ($ksfResult.Code -eq 2) 'unsupported launcher arguments return 2'
    $ksfBootstrap = @'
function ksf_bootstrap_main {
    $ksfReceived = @{ root = $env:KSF_ROOT; protocol = $env:KSF_LAUNCHER_PROTOCOL; arguments = @($args) }
    [IO.File]::WriteAllText((Join-Path $env:KSF_ROOT 'received.json'), (ConvertTo-Json -InputObject $ksfReceived -Depth 5), (New-Object Text.UTF8Encoding $false))
    Write-Output 'fixture output'
    $global:LASTEXITCODE = 37
}
'@
    Write-KsfFixture $ksfRoot '.agents/core/runtime/bootstrap.ps1' $ksfBootstrap
    $ksfArguments = @('hello', 'space value', '', 'literal"quote', '$HOME;*', '--json')
    $ksfResult = Invoke-KsfLauncher $ksfRoot $ksfArguments
    $ksfReceived = ConvertFrom-Json ([IO.File]::ReadAllText((Join-Path $ksfRoot 'received.json')))
    Assert-KsfTest ($ksfResult.Code -eq 37 -and $ksfResult.Output[0] -ceq 'fixture output') 'Core output and exit code pass through'
    Assert-KsfTest ($ksfReceived.root -ceq $ksfRoot -and $ksfReceived.protocol -ceq '1') 'root and protocol survive handoff'
    Assert-KsfTest ((ConvertTo-Json -InputObject $ksfReceived.arguments -Compress) -ceq (ConvertTo-Json -InputObject $ksfArguments -Compress)) 'empty, quoted and special arguments pass through unchanged'

    $ksfRoot = New-KsfFixture; New-KsfJournal $ksfRoot
    Write-KsfFixture $ksfRoot '.agents/runtime-data/system/transaction/old-core/sentinel' 'old'
    $ksfResult = Invoke-KsfLauncher $ksfRoot @('launcher', 'recover')
    Assert-KsfTest ($ksfResult.Code -eq 0 -and [IO.File]::ReadAllText((Join-Path $ksfRoot '.agents/core/sentinel')) -ceq 'old') 'interrupted Core rename is restored before bootstrap'
    $ksfResult = Invoke-KsfLauncher $ksfRoot @('launcher', 'recover')
    Assert-KsfTest ($ksfResult.Code -eq 0) 'recovery can be repeated'

    $ksfRoot = New-KsfFixture; New-KsfJournal $ksfRoot
    Write-KsfFixture $ksfRoot '.agents/runtime-data/system/transaction/protocol' '2'
    $ksfResult = Invoke-KsfLauncher $ksfRoot @('launcher', 'recover')
    Assert-KsfTest ($ksfResult.Code -eq 1 -and [IO.Directory]::Exists((Join-Path $ksfRoot '.agents/runtime-data/system/transaction'))) 'unknown protocol preserves transaction'

    $ksfRoot = New-KsfFixture; New-KsfJournal $ksfRoot
    Write-KsfFixture $ksfRoot '.agents/runtime-data/system/transaction/owner' $PID.ToString()
    Write-KsfFixture $ksfRoot '.agents/runtime-data/system/transaction/owner.start' (Get-Process -Id $PID).StartTime.ToUniversalTime().Ticks.ToString()
    $ksfResult = Invoke-KsfLauncher $ksfRoot @('launcher', 'recover')
    Assert-KsfTest ($ksfResult.Code -eq 1 -and [IO.Directory]::Exists((Join-Path $ksfRoot '.agents/runtime-data/system/transaction'))) 'live update owner is not rolled back'

    $ksfRoot = New-KsfFixture; New-KsfJournal $ksfRoot
    $ksfOriginal = [IO.File]::ReadAllText((Join-Path $ksfRoot '.agents/ksf.ps1'))
    foreach ($ksfFile in @('AGENTS.md', '.agents/ksf.ps1')) {
        $ksfOld = [IO.File]::ReadAllText((Join-Path $ksfRoot $ksfFile)); $ksfNew = $ksfOld + "`n# new release`n"
        Write-KsfFixture $ksfRoot ('.agents/runtime-data/system/transaction/old-root/' + $ksfFile) $ksfOld
        Write-KsfFixture $ksfRoot ('.agents/runtime-data/system/transaction/new-root/' + $ksfFile) $ksfNew
        Write-KsfFixture $ksfRoot ('.agents/runtime-data/system/transaction/root-intent/' + $ksfFile) '1'
        Write-KsfFixture $ksfRoot $ksfFile $ksfNew
    }
    $ksfResult = Invoke-KsfLauncher $ksfRoot @('launcher', 'recover')
    Assert-KsfTest ($ksfResult.Code -eq 0 -and [IO.File]::ReadAllText((Join-Path $ksfRoot '.agents/ksf.ps1')) -ceq $ksfOriginal) 'running launcher restores its own file using complete replacement'
    Assert-KsfTest ([IO.File]::ReadAllText((Join-Path $ksfRoot 'AGENTS.md')) -ceq "old agents`n") 'root snapshot is restored'

    $ksfRoot = New-KsfFixture; New-KsfJournal $ksfRoot
    Write-KsfFixture $ksfRoot '.agents/runtime-data/system/transaction/old-root/AGENTS.md' "old agents`n"
    Write-KsfFixture $ksfRoot 'AGENTS.md' 'concurrent preparation edit'
    $ksfResult = Invoke-KsfLauncher $ksfRoot @('launcher', 'recover')
    Assert-KsfTest ($ksfResult.Code -eq 0 -and [IO.File]::ReadAllText((Join-Path $ksfRoot 'AGENTS.md')) -ceq 'concurrent preparation edit') 'preparation-only failure preserves unrelated root changes'

    $ksfRoot = New-KsfFixture; New-KsfJournal $ksfRoot
    Write-KsfFixture $ksfRoot '.agents/runtime-data/system/transaction/old-root/AGENTS.md' 'old'
    Write-KsfFixture $ksfRoot '.agents/runtime-data/system/transaction/new-root/AGENTS.md' 'new'
    Write-KsfFixture $ksfRoot '.agents/runtime-data/system/transaction/root-intent/AGENTS.md' '1'
    Write-KsfFixture $ksfRoot 'AGENTS.md' 'concurrent edit'
    Write-KsfFixture $ksfRoot '.agents/core/sentinel' 'new core'
    Write-KsfFixture $ksfRoot '.agents/runtime-data/system/transaction/old-core/sentinel' 'old core'
    $ksfResult = Invoke-KsfLauncher $ksfRoot @('launcher', 'recover')
    Assert-KsfTest ($ksfResult.Code -eq 1 -and [IO.File]::ReadAllText((Join-Path $ksfRoot '.agents/core/sentinel')) -ceq 'new core') 'concurrent root edit stops before changing Core'
    Assert-KsfTest ([IO.File]::ReadAllText((Join-Path $ksfRoot 'AGENTS.md')) -ceq 'concurrent edit') 'concurrent root edit is preserved'

    $ksfRoot = New-KsfFixture; New-KsfJournal $ksfRoot
    Write-KsfFixture $ksfRoot '.agents/runtime-data/system/transaction/committed' 'fixture-1'
    Write-KsfFixture $ksfRoot '.agents/core/sentinel' 'new core'
    $ksfResult = Invoke-KsfLauncher $ksfRoot @('launcher', 'recover')
    Assert-KsfTest ($ksfResult.Code -eq 0 -and [IO.Directory]::Exists((Join-Path $ksfRoot '.agents/runtime-data/system/backups/fixture-1'))) 'committed transaction is archived'
    Assert-KsfTest ([IO.File]::ReadAllText((Join-Path $ksfRoot '.agents/core/sentinel')) -ceq 'new core') 'committed Core is retained'

    $ksfRoot = New-KsfFixture; New-KsfJournal $ksfRoot
    $ksfLock = [IO.File]::Open((Join-Path $ksfRoot '.agents/runtime-data/system/recovery.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    try { $ksfResult = Invoke-KsfLauncher $ksfRoot @('launcher', 'recover') }
    finally { $ksfLock.Dispose() }
    Assert-KsfTest ($ksfResult.Code -eq 1) 'exclusive recovery lock prevents a second recovery'

    if ($env:OS -eq 'Windows_NT') {
        $ksfRoot = New-KsfFixture; New-KsfJournal $ksfRoot
        Write-KsfFixture $ksfRoot 'outside/sentinel' 'preserve junction target'
        [void] (New-Item -ItemType Junction -Path (Join-Path $ksfRoot '.agents/runtime-data/system/transaction/old-core') -Target (Join-Path $ksfRoot 'outside'))
        $ksfResult = Invoke-KsfLauncher $ksfRoot @('launcher', 'recover')
        Assert-KsfTest ($ksfResult.Code -eq 1 -and [IO.File]::ReadAllText((Join-Path $ksfRoot 'outside/sentinel')) -ceq 'preserve junction target') 'Windows junction in journal is rejected'
    }
    Write-Output "Windows launcher checks passed: $ksfChecks"
} finally {
    foreach ($ksfRoot in $ksfTestRoots) { Remove-Item -LiteralPath $ksfRoot -Recurse -Force }
}

# Expected failure cases set LASTEXITCODE; report success only after all assertions and cleanup.
exit 0
