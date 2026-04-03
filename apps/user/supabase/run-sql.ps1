param([string]$SqlFile)
$token = "sbp_1e08505a41fec79c77984f4536de6e5ea30ff7df"
$projectId = "tnqdjcnbgrijdeotsfii"
$sql = [System.IO.File]::ReadAllText((Resolve-Path $SqlFile).Path, [System.Text.Encoding]::UTF8)
$bodyObj = @{ query = $sql }
$bodyJson = [System.Text.Encoding]::UTF8.GetBytes(($bodyObj | ConvertTo-Json -Depth 1 -Compress))
$headers = @{ "Authorization" = "Bearer $token" }
try {
  $result = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectId/database/query" -Method POST -Headers $headers -Body $bodyJson -ContentType "application/json; charset=utf-8"
  if ($result -is [array]) { Write-Host "SUCCESS: $($result.Count) row(s)" -ForegroundColor Green }
  else { Write-Host "SUCCESS" -ForegroundColor Green }
  $result | ConvertTo-Json -Depth 5
} catch {
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  if ($_.ErrorDetails) { $_.ErrorDetails.Message }
}
