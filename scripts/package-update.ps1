param(
    [string]$BuildDirectory = 'target/verified/x86_64-pc-windows-gnu/release',
    [string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$env:PSModulePath = [IO.Path]::Combine($env:SystemRoot, 'System32\WindowsPowerShell\v1.0\Modules')
Import-Module Microsoft.PowerShell.Utility -Force
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $project 'src-tauri/src/update-files.ps1')
$version = (Get-Content -Raw -LiteralPath (Join-Path $project 'package.json') | ConvertFrom-Json).version
$build = [IO.Path]::GetFullPath($BuildDirectory)
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $build 'bundle/update' }
$output = [IO.Path]::GetFullPath($OutputDirectory)
[void][IO.Directory]::CreateDirectory($output)
$sources = @{
    'SaruMD.exe' = Join-Path $build 'SaruMD.exe'
    'WebView2Loader.dll' = Join-Path $build 'WebView2Loader.dll'
    '_up_/LICENSE' = Join-Path $project 'LICENSE'
    '_up_/docs/third-party-licenses.txt' = Join-Path $project 'docs/third-party-licenses.txt'
}
if ([Diagnostics.FileVersionInfo]::GetVersionInfo($sources['SaruMD.exe']).ProductVersion -cne $version) { throw '先に現在のバージョンをビルドしてください。' }
$files = @($script:SaruMDFiles | ForEach-Object {
    $source = $sources[$_]
    [pscustomobject]@{path = $_; bytes = (Get-Item -LiteralPath $source).Length; sha256 = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()}
})
$manifest = [pscustomobject]@{schema = 1; version = $version; files = $files}
$json = $manifest | ConvertTo-Json -Depth 5
[void](Read-SaruMDManifest $json $version)
$archivePath = Join-Path $output "SaruMD_${version}_x64-update.zip"
$temporary = Join-Path $output ('.package-' + [Guid]::NewGuid().ToString('N') + '.zip')
$previous = Join-Path $output ('.previous-' + [Guid]::NewGuid().ToString('N') + '.zip')
$validation = Join-Path $output ('.validate-' + [Guid]::NewGuid().ToString('N'))
try {
    $stream = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew)
    try {
        $zip = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Create)
        try {
            foreach ($name in ($script:SaruMDFiles + @('update.json'))) {
                $entry = $zip.CreateEntry($name, [IO.Compression.CompressionLevel]::Optimal)
                $entry.LastWriteTime = [DateTimeOffset]::new(2020, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
                $entry.ExternalAttributes = 0
                $destination = $entry.Open()
                try {
                    if ($name -eq 'update.json') {
                        $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($json)
                        $destination.Write($bytes, 0, $bytes.Length)
                    } else {
                        $source = [IO.File]::OpenRead($sources[$name])
                        try { $source.CopyTo($destination) } finally { $source.Dispose() }
                    }
                } finally { $destination.Dispose() }
            }
        } finally { $zip.Dispose() }
    } finally { $stream.Dispose() }
    if (([IO.FileInfo]$temporary).Length -gt 104857600) { throw '更新用ZIPが100 MiBを超えています。' }
    Expand-SaruMDPackage $temporary $validation $version
    if ([IO.File]::Exists($archivePath)) { [IO.File]::Replace($temporary, $archivePath, $previous) } else { [IO.File]::Move($temporary, $archivePath) }
    $artifacts = @($archivePath)
    $installer = Join-Path $build "bundle/nsis/SaruMD_${version}_x64-setup.exe"
    if ([IO.File]::Exists($installer)) { $artifacts += $installer }
    $lines = @($artifacts | ForEach-Object { (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + [IO.Path]::GetFileName($_) })
    [IO.File]::WriteAllText((Join-Path $output 'SHA256SUMS.txt'), (($lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))
    [pscustomobject]@{Archive = $archivePath; Bytes = ([IO.FileInfo]$archivePath).Length; SHA256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()}
} finally {
    [IO.File]::Delete($temporary)
    [IO.File]::Delete($previous)
    if ([IO.Directory]::Exists($validation)) { Remove-SaruMDPayload $validation }
}
