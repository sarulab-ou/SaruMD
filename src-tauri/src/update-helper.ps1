$ErrorActionPreference = 'Stop'
try {
    $archive = $env:SARUMD_UPDATE_ARCHIVE
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ine $env:SARUMD_UPDATE_HASH) { throw '更新用ZIPのSHA-256が一致しません。' }
    $cache = [IO.Path]::GetDirectoryName($archive)
    $payload = Join-Path $cache 'payload'
    Invoke-SaruMDUpdate -Directory $env:SARUMD_UPDATE_DIRECTORY -Payload $payload -Version $env:SARUMD_UPDATE_VERSION -ParentId ([int]$env:SARUMD_UPDATE_PARENT)
    try {
        Remove-SaruMDPayload $payload
        [IO.File]::Delete($archive)
        [IO.Directory]::Delete($cache)
    } catch { }
} catch {
    Add-Type -AssemblyName PresentationFramework
    [Windows.MessageBox]::Show($_.Exception.Message, 'SaruMD — 更新エラー') | Out-Null
    exit 1
}
