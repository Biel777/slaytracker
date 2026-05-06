param(
  [int]$Port = 4173,
  [string]$Root = $PSScriptRoot
)

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".run"  = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $Port)
$listener.Start()
Write-Host "Slay Tracker running at http://localhost:$Port/"

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()
    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
    $requestLine = $reader.ReadLine()

    while ($reader.Peek() -ge 0) {
      $line = $reader.ReadLine()
      if ([string]::IsNullOrEmpty($line)) { break }
    }

    $status = "200 OK"
    $body = [byte[]]::new(0)
    $contentType = "application/octet-stream"

    try {
      $parts = $requestLine -split " "
      $requestPath = if ($parts.Length -gt 1) { [Uri]::UnescapeDataString($parts[1].TrimStart("/")) } else { "" }
      if ([string]::IsNullOrWhiteSpace($requestPath)) { $requestPath = "index.html" }
      if ($requestPath.Contains("?")) { $requestPath = $requestPath.Split("?")[0] }

      $target = [System.IO.Path]::GetFullPath((Join-Path $Root $requestPath))
      $rootFull = [System.IO.Path]::GetFullPath($Root)

      if (-not $target.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $target -PathType Leaf)) {
        $status = "404 Not Found"
        $contentType = "text/plain; charset=utf-8"
        $body = [System.Text.Encoding]::UTF8.GetBytes("Not found")
      } else {
        $extension = [System.IO.Path]::GetExtension($target).ToLowerInvariant()
        if ($mimeTypes.ContainsKey($extension)) { $contentType = $mimeTypes[$extension] }
        $body = [System.IO.File]::ReadAllBytes($target)
      }
    } catch {
      $status = "500 Internal Server Error"
      $contentType = "text/plain; charset=utf-8"
      $body = [System.Text.Encoding]::UTF8.GetBytes("Server error")
    }

    $header = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    $stream.Write($body, 0, $body.Length)
    $stream.Close()
    $client.Close()
  }
} finally {
  $listener.Stop()
}
