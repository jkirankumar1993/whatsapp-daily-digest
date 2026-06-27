$connections = Get-NetTCPConnection -LocalPort 3210 -State Listen -ErrorAction SilentlyContinue
if ($connections) {
  $connections | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
  Write-Host "WhatsApp Digest dashboard stopped."
} else {
  Write-Host "Dashboard is not running."
}
