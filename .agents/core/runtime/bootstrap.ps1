#Requires -Version 5.1
# Native, offline bootstrap. All business commands run in the shared JS runtime.
Set-StrictMode -Version Latest

function Stop-KsfRuntime([string] $Code, [string] $Message) { throw "KSF runtime error [$Code]: $Message" }
function Assert-KsfRuntimePath([string] $Path) {
    $root = [IO.Path]::GetFullPath($env:KSF_ROOT).TrimEnd('\')
    $full = [IO.Path]::GetFullPath($Path)
    if (-not $full.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { Stop-KsfRuntime 'UNSAFE_PATH' 'Runtime path is outside the instance.' }
    $current = $root
    foreach ($part in $full.Substring($root.Length + 1).Split([char[]]'\/')) {
        $current = Join-Path $current $part
        $item = Get-Item -LiteralPath $current -Force -ErrorAction SilentlyContinue
        if ($null -ne $item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { Stop-KsfRuntime 'UNSAFE_PATH' "Symbolic link or junction: $current" }
    }
}
function Get-KsfHash([string] $Path) {
    $stream = [IO.File]::OpenRead($Path)
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $hasher.Dispose() }
}
function Get-KsfFingerprint([string] $Path) {
    $item = Get-Item -LiteralPath $Path -Force
    return "$($item.Length):$($item.LastWriteTimeUtc.Ticks):$($item.CreationTimeUtc.Ticks):$([int]$item.Attributes)"
}
function Move-KsfRuntimeDirectory([string] $Source, [string] $Target) {
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    for ($attempt = 0; ; $attempt++) {
        try { [IO.Directory]::Move($Source, $Target); return }
        catch {
            $nativeCode = $_.Exception.InnerException.HResult -band 65535
            if ([DateTime]::UtcNow -ge $deadline -or $nativeCode -notin @(5,32,33) -or -not [IO.Directory]::Exists($Source) -or (Test-Path -LiteralPath $Target)) { throw }
            Start-Sleep -Milliseconds ([Math]::Min(250, 10 * [Math]::Pow(2,$attempt)))
        }
    }
}
function Get-KsfRuntimeDeclaration([bool] $Build) {
    if ([Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString() -cne 'X64') { Stop-KsfRuntime 'UNSUPPORTED_PLATFORM' 'This runtime package supports Windows x64.' }
    $declaration = @{}
    if ($Build) {
        $path = Join-Path $env:KSF_ROOT '.agents/core/build.json'
        Assert-KsfRuntimePath $path
        try { $config = [IO.File]::ReadAllText($path) | ConvertFrom-Json } catch { Stop-KsfRuntime 'BUILD_CONFIG_INVALID' 'Cannot read build.json.' }
        if ($config.schema_version -ne 1) { Stop-KsfRuntime 'BUILD_CONFIG_INVALID' 'Unsupported build schema.' }
        $package = $config.runtime.packages.'win32-x64'
        $declaration.version = $config.runtime.version
        $declaration.source_entry = '.agents/core/runtime/src/cli.js'
        $declaration.archive_path = $package.archive_path
        $declaration.archive_root = "node-v$($config.runtime.version)-win-x64"
        $declaration.archive_sha256 = $package.archive_sha256
        $declaration.node_sha256 = 'pending'
    } else {
        $path = Join-Path $env:KSF_ROOT '.agents/core/manifest.yaml'
        Assert-KsfRuntimePath $path
        if (-not [IO.File]::Exists($path)) { Stop-KsfRuntime 'MANIFEST_INVALID' 'Missing runtime declaration.' }
        $inside = $false; $packages = $false; $target = ''; $roots = 0; $seen = @{}
        foreach ($line in [IO.File]::ReadAllLines($path)) {
            if ($line -match '^\s*(#|$)') { continue }
            if ($line -ceq 'runtime:') { $roots++; $inside = $true; continue }
            if ($line -match '^\S') { $inside = $false; continue }
            if (-not $inside) { continue }
            if ($line -cmatch '^  ([a-z][a-z0-9_]*):\s*(.*)$') {
                $key = $Matches[1]; $value = $Matches[2].Trim(); $identity = "root/$key"
                if ($seen.ContainsKey($identity)) { Stop-KsfRuntime 'MANIFEST_INVALID' 'Duplicate runtime field.' }; $seen[$identity] = $true
                $packages = $key -ceq 'packages'; $target = ''
                if ($packages) { if ($value) { Stop-KsfRuntime 'MANIFEST_INVALID' 'Packages must be a mapping.' }; continue }
                if ($key -in @('bootstrap_protocol','engine','version','source_entry')) { $declaration[$key] = ConvertFrom-KsfScalar $value }
                continue
            }
            if ($packages -and $line -cmatch '^    ([a-z0-9-]+):$') {
                $target = $Matches[1]; $identity = "target/$target"
                if ($seen.ContainsKey($identity)) { Stop-KsfRuntime 'MANIFEST_INVALID' 'Duplicate platform.' }; $seen[$identity] = $true; continue
            }
            if ($packages -and $target -and $line -cmatch '^      ([a-z][a-z0-9_]*):\s*(.*)$') {
                $key = $Matches[1]; $value = $Matches[2].Trim(); $identity = "$target/$key"
                if ($seen.ContainsKey($identity) -or $key -notin @('archive_path','archive_root','archive_sha256','node_sha256','distribution_url')) { Stop-KsfRuntime 'MANIFEST_INVALID' 'Duplicate or unknown package field.' }
                $seen[$identity] = $true
                if ($target -ceq 'win32-x64') { $declaration[$key] = ConvertFrom-KsfScalar $value }; continue
            }
            Stop-KsfRuntime 'MANIFEST_INVALID' 'Unsupported runtime YAML syntax.'
        }
        if ($roots -ne 1 -or $declaration.bootstrap_protocol -cne '1' -or $declaration.engine -cne 'nodejs') { Stop-KsfRuntime 'MANIFEST_INVALID' 'Unsupported bootstrap protocol or engine.' }
    }
    if ($declaration.version -cnotmatch '^\d+\.\d+\.\d+$' -or $declaration.source_entry -cnotmatch '^\.agents/core/runtime/src/[A-Za-z0-9_./-]+\.js$' -or $declaration.source_entry.Contains('..') -or $declaration.source_entry.Contains('//')) { Stop-KsfRuntime 'MANIFEST_INVALID' 'Invalid runtime version or entry.' }
    if ($declaration.archive_path -cnotmatch '^\.agents/core/runtime/packages/[A-Za-z0-9_.-]+\.zip$' -or $declaration.archive_path.Contains('..') -or $declaration.archive_root -cne "node-v$($declaration.version)-win-x64" -or $declaration.archive_sha256 -cnotmatch '^[0-9a-f]{64}$' -or (-not $Build -and $declaration.node_sha256 -cnotmatch '^[0-9a-f]{64}$')) { Stop-KsfRuntime 'MANIFEST_INVALID' 'Invalid bundled Windows package.' }
    return $declaration
}
function ConvertFrom-KsfScalar([string] $Value) {
    if ($Value -cmatch '^"([^"]*)"$') { $Value = $Matches[1] }
    if ($Value -match '[|\\\t\r"\x00]') { Stop-KsfRuntime 'MANIFEST_INVALID' 'Unsupported scalar syntax.' }
    return $Value
}
function Assert-KsfArchive($Declaration, [string] $Archive) {
    Assert-KsfRuntimePath $Archive
    if (-not [IO.File]::Exists($Archive)) { Stop-KsfRuntime 'ARCHIVE_MISSING' 'The declared bundled archive is missing.' }
    if ((Get-KsfHash $Archive) -cne $Declaration.archive_sha256) { Stop-KsfRuntime 'ARCHIVE_INVALID' 'The bundled archive SHA256 does not match the declaration.' }
}
function Use-KsfZip($Declaration, [string] $Archive, [string] $Destination = '') {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
    try {
        $node = $null
        foreach ($name in @('node.exe','LICENSE')) {
            $wanted = "$($Declaration.archive_root)/$name"
            $entries = @($zip.Entries | Where-Object { $_.FullName -ceq $wanted })
            if ($entries.Count -ne 1) { Stop-KsfRuntime 'ARCHIVE_INVALID' 'Required regular Node.js and LICENSE entries are missing or duplicated.' }
            $entry = $entries[0]; $mode = ($entry.ExternalAttributes -shr 16) -band 61440
            if ($entry.Length -gt 536870912 -or ($mode -ne 0 -and $mode -ne 32768)) { Stop-KsfRuntime 'ARCHIVE_INVALID' 'Archive member is not a bounded regular file.' }
            $stream = $entry.Open()
            try {
                if ($Destination) {
                    $output = [IO.File]::Open((Join-Path $Destination $name), [IO.FileMode]::CreateNew)
                    try { $stream.CopyTo($output); $output.Flush($true) } finally { $output.Dispose() }
                } elseif ($name -ceq 'node.exe') {
                    $hasher = [Security.Cryptography.SHA256]::Create()
                    try { $node = ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-','').ToLowerInvariant() } finally { $hasher.Dispose() }
                }
            } finally { $stream.Dispose() }
        }
        return $node
    } finally { $zip.Dispose() }
}
function ConvertTo-KsfNativeArgument([string] $Value) {
    $escaped = [regex]::Replace($Value, '(\\*)"', { param($m) $m.Groups[1].Value + $m.Groups[1].Value + '\"' })
    $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
    return '"' + $escaped + '"'
}
function Invoke-KsfNodeVersion([string] $Node) {
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $Node; $info.Arguments = '--version'; $info.UseShellExecute = $false; $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($info)
    try { $text = $process.StandardOutput.ReadToEnd(); $errorText = $process.StandardError.ReadToEnd(); $process.WaitForExit(); if ($process.ExitCode -ne 0) { return '' }; return $text.Trim() } finally { $process.Dispose() }
}
function Test-KsfNode($Declaration, [string] $Node) {
    Assert-KsfRuntimePath $Node
    return [IO.File]::Exists($Node) -and (Get-KsfHash $Node) -ceq $Declaration.node_sha256 -and (Invoke-KsfNodeVersion $Node) -ceq "v$($Declaration.version)"
}
function Write-KsfInstallRecord($Declaration, [string] $Install, [string] $Node) {
    $text = "protocol=1`nversion=$($Declaration.version)`nplatform=win32-x64`narchive_sha256=$($Declaration.archive_sha256)`nnode_sha256=$($Declaration.node_sha256)`nfingerprint=$(Get-KsfFingerprint $Node)`n"
    $path = Join-Path $Install '.install-record'; $temporary = "$path.$([Guid]::NewGuid().ToString('N')).tmp"
    [IO.File]::WriteAllText($temporary, $text, [Text.UTF8Encoding]::new($false))
    if ([IO.File]::Exists($path)) { [IO.File]::Replace($temporary, $path, [NullString]::Value) } else { [IO.File]::Move($temporary, $path) }
}
function Test-KsfReady($Declaration, [string] $Install, [string] $Node) {
    $path = Join-Path $Install '.install-record'
    Assert-KsfRuntimePath $path; Assert-KsfRuntimePath $Node
    if (-not [IO.File]::Exists($path) -or -not [IO.File]::Exists($Node)) { return $false }
    $record = @{}
    foreach ($line in [IO.File]::ReadAllLines($path)) { if ($line -cnotmatch '^([^=]+)=([^=]+)$' -or $record.ContainsKey($Matches[1])) { return $false }; $record[$Matches[1]] = $Matches[2] }
    return $record.Count -eq 6 -and $record['protocol'] -ceq '1' -and $record['version'] -ceq $Declaration.version -and $record['platform'] -ceq 'win32-x64' -and $record['archive_sha256'] -ceq $Declaration.archive_sha256 -and $record['node_sha256'] -ceq $Declaration.node_sha256 -and $record['fingerprint'] -ceq (Get-KsfFingerprint $Node)
}
function ksf_bootstrap_main {
    $arguments = @($args); $build = $arguments.Count -gt 0 -and $arguments[0] -ceq 'build'
    $declaration = Get-KsfRuntimeDeclaration $build
    $archive = Join-Path $env:KSF_ROOT $declaration.archive_path
    $ksfRuntimeHome = Join-Path $env:KSF_ROOT '.agents/runtime-data/runtime'
    $identity = "$($declaration.version)-win32-x64-$($declaration.archive_sha256)"
    $install = Join-Path $ksfRuntimeHome "node/$identity"; $node = Join-Path $install 'node.exe'
    $cli = Join-Path $env:KSF_ROOT $declaration.source_entry
    Assert-KsfRuntimePath $cli
    if (-not [IO.File]::Exists($cli)) { Stop-KsfRuntime 'CLI_MISSING' 'The declared JavaScript entry is missing.' }
    if ($build) { Assert-KsfArchive $declaration $archive; $declaration.node_sha256 = Use-KsfZip $declaration $archive }
    $verify = $arguments.Count -ge 2 -and $arguments[0] -ceq 'runtime' -and $arguments[1] -ceq 'verify'
    Remove-Item Env:KSF_BOOTSTRAP_VERIFIED -ErrorAction SilentlyContinue
    if ($verify -or -not (Test-KsfReady $declaration $install $node)) {
        foreach ($directory in @($ksfRuntimeHome, (Join-Path $ksfRuntimeHome 'node'), (Join-Path $ksfRuntimeHome 'staging'), (Join-Path $ksfRuntimeHome 'locks'))) { Assert-KsfRuntimePath $directory; [void][IO.Directory]::CreateDirectory($directory) }
        $lockPath = Join-Path $ksfRuntimeHome "locks/$identity.lock"; Assert-KsfRuntimePath $lockPath
        $lock = $null; $deadline = [DateTime]::UtcNow.AddSeconds(30)
        while ($null -eq $lock) {
            try { $lock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
            catch [IO.IOException] { if ([DateTime]::UtcNow -ge $deadline) { Stop-KsfRuntime 'LOCK_TIMEOUT' 'Timed out waiting for runtime preparation.' }; Start-Sleep -Milliseconds 100 }
        }
        $stage = ''
        try {
            foreach ($orphan in Get-ChildItem -LiteralPath (Join-Path $ksfRuntimeHome 'staging') -Filter "$identity.*" -Force) {
                Assert-KsfTree $orphan.FullName
                $retired = Join-Path $orphan.FullName 'previous'
                if ([IO.Directory]::Exists($retired)) {
                    if (-not [IO.Directory]::Exists($install)) { Move-KsfRuntimeDirectory $retired $install }
                    elseif (-not (Test-KsfNode $declaration $node)) { Stop-KsfRuntime 'RECOVERY_CONFLICT' 'Both an incomplete installation and a retired runtime exist; preserve them for recovery.' }
                }
                Remove-Item -LiteralPath $orphan.FullName -Recurse -Force
            }
            if ($verify) { Assert-KsfArchive $declaration $archive }
            if (-not (Test-KsfReady $declaration $install $node) -or $verify) {
                if (Test-KsfNode $declaration $node) { Write-KsfInstallRecord $declaration $install $node }
                else {
                    Assert-KsfArchive $declaration $archive
                    [Console]::Error.WriteLine("KSF: preparing Node.js $($declaration.version) (win32-x64).")
                    $stage = Join-Path $ksfRuntimeHome "staging/$identity.$([Guid]::NewGuid().ToString('N'))"
                    [void][IO.Directory]::CreateDirectory($stage)
                    $prepared = Join-Path $stage 'prepared'; [void][IO.Directory]::CreateDirectory($prepared)
                    [void](Use-KsfZip $declaration $archive $prepared)
                    $preparedNode = Join-Path $prepared 'node.exe'
                    if (-not (Test-KsfNode $declaration $preparedNode)) { Stop-KsfRuntime 'NODE_INVALID' 'Prepared Node.js does not match the declared SHA256 or version.' }
                    Write-KsfInstallRecord $declaration $prepared $preparedNode
                    $previous = Join-Path $stage 'previous'
                    if ([IO.Directory]::Exists($install)) { Move-KsfRuntimeDirectory $install $previous }
                    try { Move-KsfRuntimeDirectory $prepared $install }
                    catch { if ([IO.Directory]::Exists($previous) -and -not [IO.Directory]::Exists($install)) { Move-KsfRuntimeDirectory $previous $install }; throw }
                }
            }
        } finally {
            # A failed rollback must retain the retired installation for the next holder.
            if ($stage -and [IO.Directory]::Exists($stage) -and -not [IO.Directory]::Exists((Join-Path $stage 'previous'))) { Remove-Item -LiteralPath $stage -Recurse -Force }
            elseif ($stage -and (Test-KsfReady $declaration $install $node)) { Remove-Item -LiteralPath $stage -Recurse -Force }
            $lock.Dispose()
        }
    }
    if ($verify) { $env:KSF_BOOTSTRAP_VERIFIED = '1' }
    $env:KSF_NODE = $node; $env:KSF_PLATFORM = 'win32-x64'
    [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $node; $info.UseShellExecute = $false
    $info.Arguments = (@($cli) + $arguments | ForEach-Object { ConvertTo-KsfNativeArgument ([string]$_) }) -join ' '
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false); $info.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)
    $info.RedirectStandardInput = $ksfPipelineInput.Count -gt 0
    $process = [Diagnostics.Process]::Start($info)
    try {
        if ($info.RedirectStandardInput) {
            $inputBytes = [Text.Encoding]::UTF8.GetBytes(($ksfPipelineInput -join "`n"))
            $process.StandardInput.BaseStream.Write($inputBytes, 0, $inputBytes.Length); $process.StandardInput.BaseStream.Flush(); $process.StandardInput.Close()
        }
        $stdoutOpen = $true; $stderrOpen = $true
        $stdoutTask = $process.StandardOutput.ReadLineAsync(); $stderrTask = $process.StandardError.ReadLineAsync()
        while ($stdoutOpen -or $stderrOpen) {
            $pending = @(); if ($stdoutOpen) { $pending += $stdoutTask }; if ($stderrOpen) { $pending += $stderrTask }
            [void][Threading.Tasks.Task]::WaitAny([Threading.Tasks.Task[]]$pending,1000)
            if ($stdoutOpen -and $stdoutTask.IsCompleted) { $line = $stdoutTask.GetAwaiter().GetResult(); if ($null -eq $line) { $stdoutOpen = $false } else { if($ksfPipelineOutput){Write-Output $line}else{[Console]::Out.WriteLine($line)}; $stdoutTask = $process.StandardOutput.ReadLineAsync() } }
            if ($stderrOpen -and $stderrTask.IsCompleted) { $line = $stderrTask.GetAwaiter().GetResult(); if ($null -eq $line) { $stderrOpen = $false } else { [Console]::Error.WriteLine($line); $stderrTask = $process.StandardError.ReadLineAsync() } }
        }
        $process.WaitForExit(); $global:LASTEXITCODE = $process.ExitCode
    } finally { $process.Dispose() }
}
