$ErrorActionPreference = 'Stop'
$env:PSModulePath = [IO.Path]::Combine($env:SystemRoot, 'System32\WindowsPowerShell\v1.0\Modules')
Import-Module Microsoft.PowerShell.Utility -Force
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $project 'src-tauri/src/update-files.ps1')
$version = (Get-Content -Raw -LiteralPath (Join-Path $project 'package.json') | ConvertFrom-Json).version
$root = Join-Path $project ('.tools/update-tests-' + [Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root)
$utf8 = New-Object Text.UTF8Encoding($false)
function Check($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Expect-Failure([scriptblock]$Action, [string]$Message) {
    $failed = $false
    try { & $Action } catch { $failed = $true; Write-Host ('Expected failure: ' + $_.Exception.Message) }
    Check $failed $Message
}
function Build-Fixture([string]$Path, [string]$Label, [string]$ProductVersion, [int]$ExitCode = 0) {
    $source = @"
using System; using System.IO; using System.Reflection; using System.Threading;
[assembly: AssemblyInformationalVersion("$ProductVersion")]
class Fixture { [STAThread] static void Main(string[] args) {
 if(args.Length > 0 && args[0] == "parent") { Thread.Sleep(1200); return; }
 int exitCode = int.Parse("$ExitCode"); if(exitCode != 0) { Environment.Exit(exitCode); }
 File.WriteAllText(Environment.GetEnvironmentVariable("SARUMD_TEST_CAPTURE"), "$Label");
}}
"@
    $cs = $Path + '.cs'; [IO.File]::WriteAllText($cs, $source, $utf8)
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    & $compiler /nologo /utf8output /target:winexe "/out:$Path" $cs
    Check ($LASTEXITCODE -eq 0) 'Fixture compilation failed'
}
function New-OldInstall([string]$Name) {
    $directory = Join-Path $root $Name; [void][IO.Directory]::CreateDirectory($directory)
    foreach ($relative in $script:SaruMDFiles) {
        $path = Get-SaruMDFile $directory $relative; [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path))
        if ($relative -eq 'SaruMD.exe') { [IO.File]::Copy($oldFixture, $path) } else { [IO.File]::WriteAllText($path, 'old-' + $relative, $utf8) }
    }
    [IO.File]::WriteAllText((Join-Path $directory 'notes.md'), 'user document', $utf8)
    [IO.File]::WriteAllText((Join-Path $directory 'uninstall.exe'), 'keep uninstaller', $utf8)
    return $directory
}
function Wait-Capture([string]$Expected) {
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if ([IO.File]::Exists($env:SARUMD_TEST_CAPTURE) -and [IO.File]::ReadAllText($env:SARUMD_TEST_CAPTURE) -eq $Expected) { return }
        Start-Sleep -Milliseconds 100
    }
    throw 'Expected restarted fixture was not observed'
}
$oldFixture = Join-Path $root 'old.exe'; Build-Fixture $oldFixture 'old' '0.1.21'
$build = Join-Path $root 'build'; [void][IO.Directory]::CreateDirectory($build)
Build-Fixture (Join-Path $build 'SaruMD.exe') 'new' $version
[IO.File]::WriteAllText((Join-Path $build 'WebView2Loader.dll'), 'MZ-test-loader', $utf8)
$packaged = & (Join-Path $PSScriptRoot 'package-update.ps1') -BuildDirectory $build -OutputDirectory (Join-Path $root 'archive')
$again = & (Join-Path $PSScriptRoot 'package-update.ps1') -BuildDirectory $build -OutputDirectory (Join-Path $root 'archive')
Check ($again.SHA256 -eq $packaged.SHA256) 'Repackaging changed the archive bytes'
$payload = Join-Path $root 'payload'; Expand-SaruMDPackage $packaged.Archive $payload $version
$manifest = Assert-SaruMDPayload $payload $version
$install = New-OldInstall 'success 日本語 (space)'
$env:SARUMD_TEST_CAPTURE = Join-Path $root 'success.txt'
$parentInfo = New-Object Diagnostics.ProcessStartInfo
$parentInfo.FileName = Join-Path $install 'SaruMD.exe'; $parentInfo.Arguments = 'parent'; $parentInfo.UseShellExecute = $false; $parentInfo.CreateNoWindow = $true
$parent = [Diagnostics.Process]::Start($parentInfo)
$parentId = $parent.Id; $parent.Dispose()
$timer = [Diagnostics.Stopwatch]::StartNew()
Invoke-SaruMDUpdate $install $payload $version $parentId
$timer.Stop()
Check ($timer.ElapsedMilliseconds -ge 1000) 'Did not wait for the parent to exit'
Wait-Capture 'new'
foreach ($file in $manifest.files) { Assert-SaruMDFile (Get-SaruMDFile $install $file.path) $file }
Check ([IO.File]::ReadAllText((Join-Path $install 'notes.md')) -eq 'user document') 'Document was modified'
Check ([IO.File]::ReadAllText((Join-Path $install 'uninstall.exe')) -eq 'keep uninstaller') 'Uninstaller was modified'
Check (@(Get-ChildItem -LiteralPath $install -Force -Filter '.sarumd-update-*').Count -eq 0) 'Transaction directory was not cleaned'

$lockedInstall = New-OldInstall 'rollback'
$before = @{}; foreach ($relative in $script:SaruMDFiles) { $before[$relative] = (Get-FileHash -LiteralPath (Get-SaruMDFile $lockedInstall $relative)).Hash }
$env:SARUMD_TEST_CAPTURE = Join-Path $root 'rollback.txt'
$locked = [IO.File]::Open((Join-Path $lockedInstall 'WebView2Loader.dll'), [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
try { Expect-Failure { Invoke-SaruMDUpdate $lockedInstall $payload $version 2147483647 } 'Locked destination should fail' } finally { $locked.Dispose() }
Wait-Capture 'old'
foreach ($relative in $script:SaruMDFiles) { Check ((Get-FileHash -LiteralPath (Get-SaruMDFile $lockedInstall $relative)).Hash -eq $before[$relative]) "Rollback mismatch: $relative" }

$crashFixture = Join-Path $root 'crash.exe'; Build-Fixture $crashFixture 'crash' $version 23
$crashPayload = Join-Path $root 'crash-payload'; Expand-SaruMDPackage $packaged.Archive $crashPayload $version
[IO.File]::Copy($crashFixture, (Join-Path $crashPayload 'SaruMD.exe'), $true)
$crashManifest = $manifest | ConvertTo-Json -Depth 5 | ConvertFrom-Json
$crashManifest.files[0].bytes = ([IO.FileInfo]$crashFixture).Length
$crashManifest.files[0].sha256 = (Get-FileHash -LiteralPath $crashFixture).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $crashPayload 'update.json'), ($crashManifest | ConvertTo-Json -Depth 5), $utf8)
$crashInstall = New-OldInstall 'restart-failure'; $env:SARUMD_TEST_CAPTURE = Join-Path $root 'restart-failure.txt'
Expect-Failure { Invoke-SaruMDUpdate $crashInstall $crashPayload $version 2147483647 } 'Crashing new app should roll back'
Wait-Capture 'old'
foreach ($relative in $script:SaruMDFiles) { Check ((Get-FileHash -LiteralPath (Get-SaruMDFile $crashInstall $relative)).Hash -eq $before[$relative]) "Restart rollback mismatch: $relative" }

# Exercise the actual hidden helper entry point and encoded command transport.
# Substitute only error presentation, so a failing test cannot leave a message box open.
$helperCache = Join-Path $root 'helper-cache'; [void][IO.Directory]::CreateDirectory($helperCache)
$helperZip = Join-Path $helperCache ([IO.Path]::GetFileName($packaged.Archive))
[IO.File]::Copy($packaged.Archive, $helperZip)
Expand-SaruMDPackage $helperZip (Join-Path $helperCache 'payload') $version
$helperInstall = New-OldInstall 'encoded-helper'
$env:SARUMD_TEST_CAPTURE = Join-Path $root 'helper-started.txt'
$env:SARUMD_UPDATE_ARCHIVE = $helperZip; $env:SARUMD_UPDATE_HASH = $packaged.SHA256
$env:SARUMD_UPDATE_DIRECTORY = $helperInstall; $env:SARUMD_UPDATE_VERSION = $version; $env:SARUMD_UPDATE_PARENT = '2147483647'
$commonScript = [IO.File]::ReadAllText((Join-Path $project 'src-tauri/src/update-files.ps1')).TrimStart([char]0xfeff)
$helperScript = [IO.File]::ReadAllText((Join-Path $project 'src-tauri/src/update-helper.ps1')) -replace '\[Windows\.MessageBox\]::Show\([^\r\n]+', '[Console]::Error.WriteLine($$_.Exception.Message)'
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($commonScript + "`n" + $helperScript))
Check ($encoded.Length -le 30000) 'Encoded helper exceeds the native command limit'
$helperStart = New-Object Diagnostics.ProcessStartInfo
$helperStart.FileName = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$helperStart.Arguments = '-NoProfile -NonInteractive -EncodedCommand ' + $encoded
$helperStart.EnvironmentVariables['PSModulePath'] = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/Modules'
$helperStart.UseShellExecute = $false; $helperStart.CreateNoWindow = $true; $helperStart.RedirectStandardError = $true
$helper = [Diagnostics.Process]::Start($helperStart)
try {
    if (-not $helper.WaitForExit(15000)) { $helper.Kill(); throw 'Helper timed out' }
    $helperError = $helper.StandardError.ReadToEnd()
    Check ($helper.ExitCode -eq 0) ('Encoded helper failed: ' + $helperError)
} finally { $helper.Dispose() }
Wait-Capture 'new'
Check (-not [IO.Directory]::Exists($helperCache)) 'Helper cache was not cleaned'
foreach ($file in $manifest.files) { Assert-SaruMDFile (Get-SaruMDFile $helperInstall $file.path) $file }

function Rewrite-Zip([string]$Name, [string]$Mode) {
    $path = Join-Path $root ($Name + '.zip')
    $inputFile = [IO.File]::OpenRead($packaged.Archive); $inputZip = New-Object IO.Compression.ZipArchive($inputFile, [IO.Compression.ZipArchiveMode]::Read)
    $outputFile = [IO.File]::Open($path, [IO.FileMode]::CreateNew); $outputZip = New-Object IO.Compression.ZipArchive($outputFile, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($original in $inputZip.Entries) {
            $nameInZip = $original.FullName
            if ($original.FullName -eq 'WebView2Loader.dll') {
                if ($Mode -eq 'traversal') { $nameInZip = '../escape.txt' }
                if ($Mode -eq 'duplicate') { $nameInZip = 'SaruMD.exe' }
            }
            $entry = $outputZip.CreateEntry($nameInZip)
            if ($Mode -eq 'symlink' -and $original.FullName -eq 'WebView2Loader.dll') { $entry.ExternalAttributes = -1610612736 }
            $source = $original.Open(); $destination = $entry.Open()
            try { $source.CopyTo($destination) } finally { $source.Dispose(); $destination.Dispose() }
        }
    } finally { $inputZip.Dispose(); $inputFile.Dispose(); $outputZip.Dispose(); $outputFile.Dispose() }
    return $path
}
foreach ($mode in @('traversal', 'duplicate', 'symlink')) {
    $bad = Rewrite-Zip $mode $mode
    Expect-Failure { Expand-SaruMDPackage $bad (Join-Path $root ('bad-' + $mode)) $version } "Accepted unsafe ZIP: $mode"
}
Check (-not [IO.File]::Exists((Join-Path $root 'escape.txt'))) 'ZIP escaped the payload root'
Expect-Failure { Expand-SaruMDPackage $packaged.Archive (Join-Path $root 'bad-version') '9.9.9' } 'Accepted wrong version'
$oversized = $manifest | ConvertTo-Json -Depth 5 | ConvertFrom-Json; $oversized.files[0].bytes = 209715201
Expect-Failure { Read-SaruMDManifest ($oversized | ConvertTo-Json -Depth 5) $version } 'Accepted oversized manifest'
[IO.File]::AppendAllText((Join-Path $payload 'WebView2Loader.dll'), 'tampered')
Expect-Failure { Invoke-SaruMDUpdate $install $payload $version 2147483647 } 'Accepted tampered payload'
foreach ($file in $manifest.files) { Assert-SaruMDFile (Get-SaruMDFile $install $file.path) $file }
$report = [pscustomobject]@{status = 'PASS'; parentWaitMilliseconds = $timer.ElapsedMilliseconds; checks = @('deterministic ZIP packaging and validation', 'parent exit before replacement', 'file replacement and restart', 'Japanese/spaces in install path', 'document/uninstaller preservation', 'locked-file rollback and old-app restart', 'crashing new app rollback and old-app restart', 'encoded helper and cache cleanup', 'traversal/duplicate/symlink ZIP rejection', 'version/size/hash rejection'); root = $root}
$report | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $project '.tools/update-zip-tests.json')
$report | ConvertTo-Json -Depth 4
