[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testId = [Guid]::NewGuid().ToString('N')
$prefix = 'Software\WinMD\InstallerTests\' + $testId
$testDir = Join-Path $repoRoot ('.tools/association-probe-' + $testId)
New-Item -ItemType Directory -Path $testDir | Out-Null
$probeExe = Join-Path $testDir 'probe.exe'
$probeSource = Join-Path $testDir 'probe.nsi'
$fakeInstall = Join-Path ([IO.Path]::GetTempPath()) 'WinMD association (日本語)'

function ConvertTo-WslPath([string]$value) {
    if ($value -notmatch '^([A-Za-z]):[\\/](.*)$') { throw 'A drive-qualified Windows path is required.' }
    return '/mnt/' + $Matches[1].ToLowerInvariant() + '/' + $Matches[2].Replace('\', '/')
}
function Quote-Bash([string]$value) {
    if ($value.Contains("'")) { throw 'Apostrophes in the test workspace path are not supported.' }
    return "'" + $value + "'"
}
function Read-UserChoice {
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md\UserChoice')
    if ($null -eq $key) { return '' }
    try { return (($key.GetValueNames() | Sort-Object | ForEach-Object { $_ + '=' + $key.GetValue($_) }) -join "`n") }
    finally { $key.Dispose() }
}

$userChoiceBefore = Read-UserChoice
$nativeCompiler = Get-Command makensis.exe -ErrorAction SilentlyContinue
$outFile = if ($nativeCompiler) { $probeExe } else { ConvertTo-WslPath $probeExe }
$source = @('Unicode true', 'RequestExecutionLevel user', 'SilentInstall silent', ('OutFile "' + $outFile + '"'), 'Section', ('StrCpy $INSTDIR "' + $fakeInstall + '"'))
$writes = 0
foreach ($line in Get-Content -LiteralPath (Join-Path $repoRoot 'src-tauri/installer-hooks.nsh')) {
    # Compile the actual installer values, changing only their registry destination.
    if ($line -match '^\s*WriteRegStr HKCU "([^"]+)" "([^"]*)" (.+)$') {
        $source += 'WriteRegStr HKCU "' + $prefix + '\' + $Matches[1] + '" "' + $Matches[2] + '" ' + $Matches[3]
        $writes++
    }
}
if ($writes -lt 6) { throw 'Installer association writes were not found.' }
$source += 'SectionEnd'
[IO.File]::WriteAllText($probeSource, ($source -join "`n"), [Text.UTF8Encoding]::new($false))

try {
    if ($nativeCompiler) { & $nativeCompiler.Source -V2 $probeSource }
    else {
        $wslRoot = ConvertTo-WslPath $repoRoot
        $command = 'cd ' + (Quote-Bash $wslRoot) + ' && NSISDIR=' + (Quote-Bash ($wslRoot + '/.tools/nsis/usr/share/nsis')) + ' ' + (Quote-Bash ($wslRoot + '/.tools/nsis/usr/bin/makensis')) + ' -V2 ' + (Quote-Bash (ConvertTo-WslPath $probeSource))
        & wsl.exe bash -lc $command
    }
    if ($LASTEXITCODE -ne 0) { throw 'NSIS association probe compilation failed.' }
    $process = Start-Process -FilePath $probeExe -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw ('Association probe failed: ' + $process.ExitCode) }

    $expectedCommand = '"' + (Join-Path $fakeInstall 'winmd.exe') + '" "%1"'
    $expectedIcon = '"' + (Join-Path $fakeInstall 'winmd.exe') + '",0'
    $checks = @(
        @('Software\Classes\WinMD.md\shell\open\command', '', $expectedCommand),
        @('Software\Classes\WinMD.markdown\shell\open\command', '', $expectedCommand),
        @('Software\Classes\Applications\winmd.exe\shell\open\command', '', $expectedCommand),
        @('Software\Classes\WinMD.md\DefaultIcon', '', $expectedIcon),
        @('Software\Classes\WinMD.markdown\DefaultIcon', '', $expectedIcon),
        @('Software\WinMD\Capabilities', 'ApplicationIcon', $expectedIcon)
    )
    foreach ($check in $checks) {
        $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($prefix + '\' + $check[0])
        if ($null -eq $key) { throw ('Missing probe key: ' + $check[0]) }
        try {
            $actual = $key.GetValue($check[1])
            if ($actual -cne $check[2]) { throw ('NSIS wrote an invalid association value: ' + $actual) }
        } finally { $key.Dispose() }
    }
    if ((Read-UserChoice) -cne $userChoiceBefore) { throw '.md UserChoice changed unexpectedly.' }
    Write-Output ('PASS: ' + $checks.Count + ' compiled NSIS association values; spaces/Japanese path; UserChoice unchanged.')
} finally {
    # Remove only this run's GUID namespace, never real file associations.
    $parent = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\WinMD\InstallerTests', $true)
    if ($parent) { try { $parent.DeleteSubKeyTree($testId, $false) } finally { $parent.Dispose() } }
}
