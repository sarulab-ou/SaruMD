$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $uri = [Uri]$env:SARUMD_FETCH_URL
    $limit = [long]$env:SARUMD_FETCH_LIMIT
    for ($redirect = 0; $redirect -le 5; $redirect++) {
        if ($uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Host -notin @('api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com')) { throw '取得先が不正です。' }
        $request = [Net.HttpWebRequest]::Create($uri)
        $request.AllowAutoRedirect = $false
        $request.UseDefaultCredentials = $false
        $request.CachePolicy = [Net.Cache.RequestCachePolicy]::new([Net.Cache.RequestCacheLevel]::NoCacheNoStore)
        $request.Timeout = 45000
        $request.ReadWriteTimeout = 45000
        $request.UserAgent = 'SaruMD-Updater'
        $request.Accept = 'application/vnd.github+json'
        $request.Headers.Add('X-GitHub-Api-Version', '2022-11-28')
        $response = $request.GetResponse()
        try {
            if ([int]$response.StatusCode -ge 300 -and [int]$response.StatusCode -lt 400) {
                $uri = [Uri]::new($uri, $response.Headers['Location'])
                continue
            }
            if ([int]$response.StatusCode -ne 200 -or $response.ContentLength -gt $limit) { throw '応答またはサイズが不正です。' }
            $inputStream = $response.GetResponseStream()
            $outputStream = [IO.File]::Open($env:SARUMD_FETCH_PATH, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
            try {
                $buffer = New-Object byte[] 65536
                $total = 0L
                while (($count = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                    $total += $count
                    if ($total -gt $limit) { throw 'サイズ上限を超えました。' }
                    $outputStream.Write($buffer, 0, $count)
                }
            } finally { $outputStream.Dispose(); $inputStream.Dispose() }
            exit 0
        } finally { $response.Dispose() }
    }
    throw 'リダイレクトが多すぎます。'
} catch {
    [Console]::Error.WriteLine('GitHubから取得できませんでした。通信環境を確認し、時間を置いて再試行してください。')
    exit 1
}
