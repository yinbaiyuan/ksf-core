#Requires -Version 5.1
param([ValidateSet('start','stop','status','run','logs')][string]$Action='start')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ksfRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$launcher=Join-Path $ksfRoot '.agents/ksf.ps1'
if($Action -eq 'start'){& $launcher open --json;exit $LASTEXITCODE}
if($Action -eq 'logs'){
  $raw=& $launcher service logs --json
  $code=$LASTEXITCODE
  if($code -eq 0){$value=$raw|ConvertFrom-Json;foreach($item in $value.data.PSObject.Properties){Write-Output $item.Name;Write-Output $item.Value}}else{Write-Output $raw}
  exit $code
}
& $launcher service $Action --json
exit $LASTEXITCODE
