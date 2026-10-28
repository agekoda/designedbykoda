@echo off
rem ---------------------------------------------------------------
rem  Add / close status page incidents for designedbykoda.com
rem  Put this file in your project folder (next to wrangler.json)
rem  and double-click it. Needs Node (npx) and your Cloudflare login.
rem ---------------------------------------------------------------
cd /d "%~dp0"
set "KODA_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f = Get-Content -Raw -LiteralPath '%~f0'; $i = $f.LastIndexOf('#PSCODE#'); Invoke-Expression $f.Substring($i + 8)"
echo.
pause
exit /b
#PSCODE#
$ErrorActionPreference = 'Stop'
$Db = 'eink-calendar-db'
$Dir = $env:KODA_DIR
if (-not $Dir) { $Dir = (Get-Location).Path }
Set-Location $Dir
$DryRun = [bool]$env:KODA_DRYRUN

if (-not (Test-Path 'wrangler.json')) {
    Write-Host ''
    Write-Host 'This file needs to sit in your designedbykoda project folder (the one with wrangler.json).' -ForegroundColor Yellow
    Write-Host ('Looked in: ' + $Dir)
    return
}

function Sql-Text($s) {
    # double quotes would break the command line, so they become apostrophes
    $s = ($s -replace '"', "'") -replace "[\r\n]+", ' '
    return "'" + ($s -replace "'", "''") + "'"
}

function Pick($heading, $labels) {
    Write-Host ''
    Write-Host $heading -ForegroundColor Cyan
    for ($i = 0; $i -lt $labels.Count; $i++) { Write-Host ('  {0}) {1}' -f ($i + 1), $labels[$i]) }
    while ($true) {
        $a = (Read-Host 'Number').Trim()
        $n = 0
        if ([int]::TryParse($a, [ref]$n) -and $n -ge 1 -and $n -le $labels.Count) { return ($n - 1) }
        Write-Host '  Please type one of the numbers above.' -ForegroundColor Yellow
    }
}

function Run-Sql($sql) {
    # One statement, sent with --command (the normal query route), run through
    # cmd.exe the same way you run npx by hand.
    $one = ($sql -replace "[\r\n]+", ' ').Trim()
    $ErrorActionPreference = 'Continue'
    $shown = $one
    if ($shown.Length -gt 90) { $shown = $shown.Substring(0, 90) + '...' }
    Write-Host ('Running: npx wrangler d1 execute ' + $Db + ' --remote --command "' + $shown + '"') -ForegroundColor DarkGray
    Write-Host ('         (in ' + (Get-Location).Path + ')') -ForegroundColor DarkGray
    if ($DryRun) { return $true }
    if ($env:OS -eq 'Windows_NT') {
        & cmd.exe /c ('npx wrangler d1 execute ' + $Db + ' --remote --command "' + $one + '"') | Out-Host
    } else {
        & npx wrangler d1 execute $Db --remote --command $one | Out-Host
    }
    return ($LASTEXITCODE -eq 0)
}

function Ask-Id($what) {
    while ($true) {
        $a = (Read-Host ('Which incident id to ' + $what + '? (blank to cancel)')).Trim()
        if ($a -eq '') { return $null }
        $n = 0
        if ([int]::TryParse($a, [ref]$n) -and $n -gt 0) { return $n }
        Write-Host '  That should be a number from the id column.' -ForegroundColor Yellow
    }
}

function Show-Incidents {
    $q = "SELECT id, COALESCE(component,'(whole site)') AS component, title, severity, source, datetime(started_at,'unixepoch','localtime') AS started_local, CASE WHEN resolved_at IS NULL THEN 'ONGOING' ELSE 'resolved' END AS state FROM status_incidents ORDER BY started_at DESC LIMIT 15;"
    [void](Run-Sql $q)
}

function Add-Incident {
    $components = @('website', 'device_api', 'database', 'google_signin', 'google_calendar', 'cloudflare', 'NULL')
    $compLabels = @(
        'website          - the pages and dashboard',
        'device_api       - what the calendars talk to',
        'database         - pairing, devices, settings',
        'google_signin    - Google sign-in',
        'google_calendar  - Google Calendar',
        'cloudflare       - Cloudflare itself',
        'Whole site       - not one specific service'
    )
    $ci = Pick 'Which service is this about?' $compLabels
    $component = $components[$ci]

    Write-Host ''
    $title = ''
    while ($title.Trim() -eq '') { $title = Read-Host 'Title (short headline, e.g. Calendar updates delayed)' }
    $title = $title.Trim()
    $body = (Read-Host 'Message (what is happening / what people should know - Enter to skip)').Trim()

    $sevs = @('outage', 'degraded', 'maintenance', 'info')
    $sevLabels = @(
        'outage       - red, something is down',
        'degraded     - amber, things are slow or partly working',
        'maintenance  - amber, planned work',
        'info         - a notice only, banner does not change'
    )
    $si = Pick 'How serious is it?' $sevLabels
    $sev = $sevs[$si]

    Write-Host ''
    $mins = 0
    while ($true) {
        $m = (Read-Host 'How many minutes ago did it start? (Enter = just now)').Trim()
        if ($m -eq '') { $mins = 0; break }
        if ([int]::TryParse($m, [ref]$mins) -and $mins -ge 0) { break }
        Write-Host '  Please type a whole number of minutes, or press Enter.' -ForegroundColor Yellow
    }

    if ($component -eq 'NULL') { $compSql = 'NULL' } else { $compSql = Sql-Text $component }
    if ($body -eq '') { $bodySql = 'NULL' } else { $bodySql = Sql-Text $body }
    if ($mins -gt 0) { $startSql = "CAST((julianday('now') - 2440587.5) * 86400 AS INTEGER) - " + ($mins * 60) } else { $startSql = "CAST((julianday('now') - 2440587.5) * 86400 AS INTEGER)" }

    $sql = "INSERT INTO status_incidents (component, title, body, severity, source, started_at) VALUES (" + $compSql + ', ' + (Sql-Text $title) + ', ' + $bodySql + ', ' + (Sql-Text $sev) + ", 'manual', " + $startSql + ');'

    Write-Host ''
    Write-Host 'Here is the command it will run:' -ForegroundColor Cyan
    Write-Host $sql
    try { Set-Clipboard -Value $sql; Write-Host '(also copied to your clipboard)' -ForegroundColor DarkGray } catch { }
    Write-Host ''
    $go = (Read-Host 'Add this to your LIVE status page now? (Y/n)').Trim().ToLower()
    if ($go -eq 'n' -or $go -eq 'no') {
        Write-Host 'Not added. The command is on your clipboard if you want to paste it into the Cloudflare console instead.'
        return
    }
    if (Run-Sql $sql) {
        Write-Host ''
        Write-Host 'Done. Refresh /status in about 30 seconds.' -ForegroundColor Green
    } else {
        Write-Host ''
        Write-Host 'That did not work. Read the message above (a login prompt or no internet are the usual causes).' -ForegroundColor Red
    }
}

function Close-Incident {
    Write-Host ''
    Write-Host 'Current incidents:' -ForegroundColor Cyan
    Show-Incidents
    $id = Ask-Id 'close'
    if ($null -eq $id) { return }
    $sql = "UPDATE status_incidents SET resolved_at = CAST((julianday('now') - 2440587.5) * 86400 AS INTEGER) WHERE id = " + $id + ' AND resolved_at IS NULL;'
    if (Run-Sql $sql) { Write-Host 'Closed. It will move to Past incidents.' -ForegroundColor Green } else { Write-Host 'That did not work. Read the message above.' -ForegroundColor Red }
}

function Delete-Incident {
    Write-Host ''
    Write-Host 'Current incidents:' -ForegroundColor Cyan
    Show-Incidents
    $id = Ask-Id 'DELETE for good'
    if ($null -eq $id) { return }
    $sure = (Read-Host ('Really delete incident ' + $id + '? This removes it from the history. (y/N)')).Trim().ToLower()
    if ($sure -ne 'y' -and $sure -ne 'yes') { Write-Host 'Cancelled.'; return }
    if (Run-Sql ('DELETE FROM status_incidents WHERE id = ' + $id + ';')) { Write-Host 'Deleted.' -ForegroundColor Green } else { Write-Host 'That did not work. Read the message above.' -ForegroundColor Red }
}

Write-Host ''
Write-Host '=== designedbykoda status page: incidents ===' -ForegroundColor Cyan
if ($DryRun) { Write-Host '(dry run: nothing will be sent)' -ForegroundColor Yellow }
while ($true) {
    $mi = Pick 'What do you want to do?' @('Add an incident or notice', 'Show recent incidents', 'Close an ongoing incident', 'Delete an incident', 'Quit')
    switch ($mi) {
        0 { Add-Incident }
        1 { Show-Incidents }
        2 { Close-Incident }
        3 { Delete-Incident }
        4 { return }
    }
}
