$ErrorActionPreference = 'Stop'
try {
    $parent = Get-Process -Id ([int]$env:SARUMD_UPDATE_PARENT) -ErrorAction SilentlyContinue
    if ($parent -and -not $parent.WaitForExit(120000)) { throw 'SaruMDが終了しなかったため更新を中止しました。' }
    $installer = $env:SARUMD_UPDATE_INSTALLER
    if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne $env:SARUMD_UPDATE_HASH) { throw '更新ファイルのSHA-256が一致しません。' }
    $arguments = '/P /UPDATE /R /D=' + $env:SARUMD_UPDATE_DIRECTORY
    $process = Start-Process -FilePath $installer -ArgumentList $arguments -PassThru
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw 'インストーラーが正常に完了しませんでした。' }
    # Delete only our one installer, then its empty directory; never delete recursively.
    [IO.File]::Delete($installer)
    [IO.Directory]::Delete([IO.Path]::GetDirectoryName($installer))
} catch {
    Add-Type -AssemblyName PresentationFramework
    [Windows.MessageBox]::Show($_.Exception.Message, 'SaruMD — 更新エラー') | Out-Null
    exit 1
}
