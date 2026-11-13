# Shared by native commands, packaging, and isolated update tests. No recursive deletion.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.IO.Compression
$script:SaruMDFiles = @('SaruMD.exe', 'WebView2Loader.dll', '_up_/LICENSE', '_up_/docs/third-party-licenses.txt')

function Get-SaruMDFile([string]$Root, [string]$Relative) {
    $base = [IO.Path]::GetFullPath($Root)
    if ($base.Length -gt [IO.Path]::GetPathRoot($base).Length) { $base = $base.TrimEnd('\') }
    if (-not [IO.Directory]::Exists($base) -or ([IO.File]::GetAttributes($base) -band [IO.FileAttributes]::ReparsePoint)) { throw '更新先フォルダーが不正です。' }
    $current = $base
    foreach ($part in $Relative.Split('/')) {
        if ($part -notmatch '^[A-Za-z0-9_.-]+$' -or $part -in @('.', '..')) { throw '更新ファイルのパスが不正です。' }
        $current = [IO.Path]::Combine($current, $part)
        if (([IO.File]::Exists($current) -or [IO.Directory]::Exists($current)) -and ([IO.File]::GetAttributes($current) -band [IO.FileAttributes]::ReparsePoint)) { throw 'リンク先のファイルは更新できません。' }
    }
    return $current
}

function Read-SaruMDManifest([string]$Json, [string]$Version) {
    $manifest = ConvertFrom-Json -InputObject $Json
    if ($manifest.schema -ne 1 -or $manifest.version -cne $Version -or @($manifest.files).Count -ne 4) { throw '更新用ZIPのバージョンまたは形式が不正です。' }
    $seen = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    $files = @(); $total = 0L
    foreach ($file in $manifest.files) {
        if ($script:SaruMDFiles -cnotcontains $file.path -or -not $seen.Add($file.path) -or $file.sha256 -cnotmatch '^[a-f0-9]{64}$') { throw '更新用ZIPのファイル一覧が不正です。' }
        if (($file.bytes -isnot [int] -and $file.bytes -isnot [long]) -or $file.bytes -le 0 -or $file.bytes -gt 209715200) { throw '更新ファイルのサイズが不正です。' }
        $total += $file.bytes
        if ($total -gt 209715200) { throw '更新用ZIPの展開サイズが大きすぎます。' }
        $files += [pscustomobject]@{path = $file.path; bytes = [long]$file.bytes; sha256 = $file.sha256}
    }
    return [pscustomobject]@{schema = 1; version = $Version; files = $files}
}

function Assert-SaruMDFile([string]$Path, $File) {
    if (-not [IO.File]::Exists($Path) -or ([IO.FileInfo]$Path).Length -ne $File.bytes -or (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ine $File.sha256) { throw '更新ファイルのサイズまたはSHA-256が一致しません。' }
}

function Assert-SaruMDPayload([string]$Payload, [string]$Version) {
    $manifestPath = Get-SaruMDFile $Payload 'update.json'
    if (([IO.FileInfo]$manifestPath).Length -gt 65536) { throw '更新情報が大きすぎます。' }
    $manifest = Read-SaruMDManifest ([IO.File]::ReadAllText($manifestPath, [Text.Encoding]::UTF8)) $Version
    foreach ($file in $manifest.files) { Assert-SaruMDFile (Get-SaruMDFile $Payload $file.path) $file }
    if ([Diagnostics.FileVersionInfo]::GetVersionInfo((Get-SaruMDFile $Payload 'SaruMD.exe')).ProductVersion -cne $Version) { throw '実行ファイルのバージョンが一致しません。' }
    return $manifest
}

function Copy-SaruMDEntry($Entry, [IO.Stream]$OutputStream, [long]$Limit) {
    $inputStream = $Entry.Open()
    try {
        $buffer = New-Object byte[] 65536; $total = 0L
        while (($count = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $total += $count
            if ($total -gt $Limit) { throw 'ZIPの展開サイズが一致しません。' }
            $OutputStream.Write($buffer, 0, $count)
        }
        if ($total -ne $Limit) { throw 'ZIPの展開サイズが一致しません。' }
    } finally { $inputStream.Dispose() }
}

function Expand-SaruMDPackage([string]$Archive, [string]$Payload, [string]$Version) {
    if ([IO.File]::Exists($Payload) -or [IO.Directory]::Exists($Payload)) { throw '更新の一時フォルダーが既にあります。' }
    $stream = [IO.File]::OpenRead($Archive)
    try {
        $zip = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Read)
        try {
            if ($zip.Entries.Count -ne 5) { throw '更新用ZIPの内容が不正です。' }
            $seen = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
            foreach ($entry in $zip.Entries) {
                if (($script:SaruMDFiles + @('update.json')) -cnotcontains $entry.FullName -or -not $seen.Add($entry.FullName) -or $entry.Length -gt 209715200 -or ($entry.ExternalAttributes -band 1024) -or (($entry.ExternalAttributes -shr 16) -band 61440) -eq 40960) { throw '更新用ZIPに許可されていない項目があります。' }
            }
            $info = $zip.GetEntry('update.json')
            if ($info.Length -gt 65536) { throw '更新情報が大きすぎます。' }
            $memory = New-Object IO.MemoryStream
            try {
                Copy-SaruMDEntry $info $memory $info.Length
                $utf8 = New-Object Text.UTF8Encoding($false, $true)
                $manifest = Read-SaruMDManifest ($utf8.GetString($memory.ToArray())) $Version
            } finally { $memory.Dispose() }
            [void][IO.Directory]::CreateDirectory($Payload)
            foreach ($file in $manifest.files) {
                $entry = $zip.GetEntry($file.path)
                if ($entry.Length -ne $file.bytes) { throw 'ZIP内のサイズが更新情報と一致しません。' }
                $path = Get-SaruMDFile $Payload $file.path
                [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path))
                $outputStream = [IO.File]::Open($path, [IO.FileMode]::CreateNew)
                try { Copy-SaruMDEntry $entry $outputStream $file.bytes } finally { $outputStream.Dispose() }
                Assert-SaruMDFile $path $file
            }
            [IO.File]::WriteAllText((Get-SaruMDFile $Payload 'update.json'), ($manifest | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
            [void](Assert-SaruMDPayload $Payload $Version)
        } finally { $zip.Dispose() }
    } finally { $stream.Dispose() }
}

function Remove-SaruMDPayload([string]$Root) {
    if (-not [IO.Directory]::Exists($Root)) { return }
    foreach ($relative in ($script:SaruMDFiles + @('update.json'))) { [IO.File]::Delete((Get-SaruMDFile $Root $relative)) }
    foreach ($relative in @('_up_/docs', '_up_')) {
        $directory = Get-SaruMDFile $Root $relative
        if ([IO.Directory]::Exists($directory)) { [IO.Directory]::Delete($directory) }
    }
    [IO.Directory]::Delete($Root)
}

function Start-SaruMD([string]$Directory) {
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = Get-SaruMDFile $Directory 'SaruMD.exe'
    $start.WorkingDirectory = $Directory
    $start.UseShellExecute = $false
    return [Diagnostics.Process]::Start($start)
}

function Invoke-SaruMDUpdate([string]$Directory, [string]$Payload, [string]$Version, [int]$ParentId) {
    $manifest = Assert-SaruMDPayload $Payload $Version
    foreach ($file in $manifest.files) { [void](Get-SaruMDFile $Directory $file.path) }
    $lockPath = Get-SaruMDFile $Directory '.sarumd-update.lock'
    $lock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $transaction = Join-Path $Directory ('.sarumd-update-' + [Guid]::NewGuid().ToString('N'))
    $completed = @(); $recoveryNeeded = $false
    try {
        $parent = Get-Process -Id $ParentId -ErrorAction SilentlyContinue
        if ($parent) {
            try { if (-not $parent.WaitForExit(120000)) { throw 'SaruMDが終了しなかったため更新を中止しました。' } }
            finally { $parent.Dispose() }
        }
        $manifest = Assert-SaruMDPayload $Payload $Version
        $new = Join-Path $transaction 'new'; $backup = Join-Path $transaction 'backup'
        [void][IO.Directory]::CreateDirectory($new); [void][IO.Directory]::CreateDirectory($backup)
        foreach ($file in $manifest.files) {
            $path = Get-SaruMDFile $new $file.path
            [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path))
            [IO.File]::Copy((Get-SaruMDFile $Payload $file.path), $path, $false)
            Assert-SaruMDFile $path $file
        }
        try {
            # Executable last; keep each old file as an atomic replacement backup.
            foreach ($file in ($manifest.files | Sort-Object @{Expression = { $_.path -ceq 'SaruMD.exe' }}, path)) {
                $target = Get-SaruMDFile $Directory $file.path; $source = Get-SaruMDFile $new $file.path; $saved = Get-SaruMDFile $backup $file.path
                [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))
                [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($saved))
                $existed = [IO.File]::Exists($target)
                $completed += [pscustomobject]@{target = $target; saved = $saved; replacement = $source; existed = $existed; file = $file}
                if ($existed) { [IO.File]::Replace($source, $target, $saved) } else { [IO.File]::Move($source, $target) }
            }
            $started = Start-SaruMD $Directory
            try {
                if ($started.WaitForExit(1000) -and $started.ExitCode -ne 0) { throw '更新したアプリの起動に失敗しました。' }
            } finally { $started.Dispose() }
        } catch {
            $failure = $_.Exception.Message
            [array]::Reverse($completed)
            foreach ($item in $completed) {
                try {
                    if ($item.existed -and [IO.File]::Exists($item.saved)) {
                        if ([IO.File]::Exists($item.target)) { [IO.File]::Replace($item.saved, $item.target, $item.replacement) } else { [IO.File]::Move($item.saved, $item.target) }
                    } elseif (-not [IO.File]::Exists($item.replacement)) {
                        if ($item.existed) { throw '置き換えの結果を確定できません。バックアップを保持します。' }
                        Assert-SaruMDFile $item.target $item.file
                        [IO.File]::Delete($item.target)
                    }
                } catch { $recoveryNeeded = $true; $failure += ' Restore: ' + $_.Exception.Message }
            }
            if ($recoveryNeeded) { throw "更新に失敗しました。旧ファイルを保持しています: $transaction $failure" }
            try { $old = Start-SaruMD $Directory; $old.Dispose() } catch { }
            throw "更新に失敗したため旧ファイルに戻しました。$failure"
        }
    } finally {
        if (-not $recoveryNeeded) {
            try { Remove-SaruMDPayload (Join-Path $transaction 'new'); Remove-SaruMDPayload (Join-Path $transaction 'backup'); [IO.Directory]::Delete($transaction) } catch { }
        }
        $lock.Dispose()
        try { [IO.File]::Delete($lockPath) } catch { }
    }
}
