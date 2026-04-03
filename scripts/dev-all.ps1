$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$appPath = Join-Path $repoRoot 'apps\user'
$logDir = Join-Path $repoRoot '.dev-logs'

$instances = @(
  @{ Name = 'user'; Port = 3000; DistDir = '.next-user'; Url = 'http://localhost:3000' },
  @{ Name = 'admin'; Port = 3001; DistDir = '.next-admin'; Url = 'http://localhost:3001' },
  @{ Name = 'partner'; Port = 3002; DistDir = '.next-partner'; Url = 'http://localhost:3002' }
)

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Get-NetTCPConnection -LocalPort 3000,3001,3002 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
  }

$lockPaths = @(
  (Join-Path $appPath '.next\dev\lock'),
  (Join-Path $appPath '.next-user\dev\lock'),
  (Join-Path $appPath '.next-admin\dev\lock'),
  (Join-Path $appPath '.next-partner\dev\lock')
)

foreach ($lockPath in $lockPaths) {
  Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
}

$started = @()

foreach ($instance in $instances) {
  $stdout = Join-Path $logDir ("{0}.out.log" -f $instance.Name)
  $stderr = Join-Path $logDir ("{0}.err.log" -f $instance.Name)

  Remove-Item -LiteralPath $stdout -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $stderr -Force -ErrorAction SilentlyContinue

  $command = @"
`$env:NEXT_PUBLIC_APP_INSTANCE = '$($instance.Name)'
`$env:NEXT_DEV_DIST_DIR = '$($instance.DistDir)'
Set-Location '$appPath'
pnpm exec next dev --webpack -p $($instance.Port)
"@

  $process = Start-Process `
    -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $command) `
    -WorkingDirectory $appPath `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru

  $started += [PSCustomObject]@{
    Name = $instance.Name
    Port = $instance.Port
    Url = $instance.Url
    ProcessId = $process.Id
    Stdout = $stdout
    Stderr = $stderr
  }
}

$deadline = (Get-Date).AddSeconds(120)

while ((Get-Date) -lt $deadline) {
  $openPorts = @(Get-NetTCPConnection -LocalPort 3000,3001,3002 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty LocalPort)

  $readyCount = ($instances | Where-Object { $openPorts -contains $_.Port }).Count
  if ($readyCount -eq $instances.Count) {
    Write-Host 'DEV_SERVERS_READY'
    $started | ForEach-Object {
      Write-Host ("{0}: {1} (PID {2})" -f $_.Name, $_.Url, $_.ProcessId)
    }
    exit 0
  }

  Start-Sleep -Seconds 2
}

Write-Host 'DEV_SERVERS_FAILED'
$started | ForEach-Object {
  Write-Host ("[{0}] stdout -> {1}" -f $_.Name, $_.Stdout)
  if (Test-Path $_.Stdout) {
    Get-Content $_.Stdout -Tail 20 -ErrorAction SilentlyContinue
  }
  Write-Host ("[{0}] stderr -> {1}" -f $_.Name, $_.Stderr)
  if (Test-Path $_.Stderr) {
    Get-Content $_.Stderr -Tail 20 -ErrorAction SilentlyContinue
  }
}

exit 1
