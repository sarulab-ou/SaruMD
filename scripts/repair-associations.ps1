[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$InstallDirectory = (Join-Path $env:LOCALAPPDATA 'WinMD')
)

$ErrorActionPreference = 'Stop'
$exe = [IO.Path]::GetFullPath((Join-Path $InstallDirectory 'winmd.exe'))
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw ('WinMD executable not found: ' + $exe) }
if (-not (Test-Path -LiteralPath (Join-Path $InstallDirectory 'WebView2Loader.dll') -PathType Leaf)) { throw 'WebView2Loader.dll is missing. Reinstall WinMD.' }
$command = '"' + $exe + '" "%1"'
$icon = '"' + $exe + '",0'
$brokenCommand = '$"' + $exe + '$" $"%1$"'
$brokenIcon = '$"' + $exe + '$",0'
$entries = @(
    @('Software\Classes\WinMD.md\shell\open\command', '', $brokenCommand, $command),
    @('Software\Classes\WinMD.markdown\shell\open\command', '', $brokenCommand, $command),
    @('Software\Classes\Applications\winmd.exe\shell\open\command', '', $brokenCommand, $command),
    @('Software\Classes\WinMD.md\DefaultIcon', '', $brokenIcon, $icon),
    @('Software\Classes\WinMD.markdown\DefaultIcon', '', $brokenIcon, $icon),
    @('Software\WinMD\Capabilities', 'ApplicationIcon', $brokenIcon, $icon)
)
$changes = @()
foreach ($entry in $entries) {
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($entry[0])
    if ($null -eq $key) { throw ('Association key is missing. Reinstall WinMD: ' + $entry[0]) }
    try {
        $value = $key.GetValue($entry[1])
        if ($value -ceq $entry[3]) { continue }
        if ($value -cne $entry[2]) { throw ('Unexpected association value; leaving it unchanged: ' + $entry[0]) }
        $changes += [PSCustomObject]@{ Path = $entry[0]; Name = $entry[1]; Before = $value; After = $entry[3] }
    } finally { $key.Dispose() }
}
if ($changes.Count -eq 0) { Write-Output 'WinMD association values are already correct.'; return }
if (-not $PSCmdlet.ShouldProcess('WinMD-owned HKCU commands/icons only', ('Repair ' + $changes.Count + ' malformed values; preserve UserChoice'))) { return }

$backupDir = Join-Path ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))) '.tools/association-backups'
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$backup = Join-Path $backupDir ((Get-Date -Format 'yyyyMMdd_HHmmss') + '-' + [Guid]::NewGuid().ToString('N') + '.json')
[IO.File]::WriteAllText($backup, ($changes | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))

$choicePath = 'Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md\UserChoice'
$choice = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($choicePath)
$choiceBefore = if ($choice) { ($choice.GetValueNames() | Sort-Object | ForEach-Object { $_ + '=' + $choice.GetValue($_) }) -join "`n" } else { '' }
if ($choice) { $choice.Dispose() }
foreach ($change in $changes) {
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($change.Path, $true)
    try {
        if ($key.GetValue($change.Name) -cne $change.Before) { throw 'Association changed during repair; stopped.' }
        $key.SetValue($change.Name, $change.After, [Microsoft.Win32.RegistryValueKind]::String)
        if ($key.GetValue($change.Name) -cne $change.After) { throw 'Association verification failed.' }
    } finally { $key.Dispose() }
}
$choice = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($choicePath)
$choiceAfter = if ($choice) { ($choice.GetValueNames() | Sort-Object | ForEach-Object { $_ + '=' + $choice.GetValue($_) }) -join "`n" } else { '' }
if ($choice) { $choice.Dispose() }
if ($choiceBefore -cne $choiceAfter) { throw 'UserChoice changed during repair; check Windows settings.' }

Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class WinMDAssociationRefresh { [DllImport("shell32.dll")] public static extern void SHChangeNotify(uint id, uint flags, IntPtr item1, IntPtr item2); }'
[WinMDAssociationRefresh]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
Write-Output ('Repaired ' + $changes.Count + ' WinMD values. UserChoice unchanged. Backup: ' + $backup)
