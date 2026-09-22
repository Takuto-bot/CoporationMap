param(
  [string]$EdinetCsvPath = "",
  [string]$CachePath = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$companiesPath = Join-Path $projectRoot "src/data/nikkei225Companies.js"
$outputPath = Join-Path $projectRoot "src/data/nikkei225Headquarters.js"
$CachePath = if ($CachePath) { $CachePath } else { Join-Path $projectRoot ".tmp-edinet/headquarters-cache.json" }
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$workDir = Join-Path $tempRoot ("corporation-map-headquarters-" + [guid]::NewGuid().ToString("N"))
$downloadUrl = "https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip"
$addressQueryOverrides = @{
  # Kyoto street-name notation is official but is not understood by the address-search endpoint.
  "7735" = "京都市上京区天神北町1番地の1"
}

function Get-NikkeiCompanies {
  $source = Get-Content -LiteralPath $companiesPath -Raw -Encoding utf8
  $pattern = '\["(?<code>[0-9A-Z]{4})",\s*"(?<name>[^"]+)",\s*"(?<category>[^"]+)"\]'
  $matches = [regex]::Matches($source, $pattern)
  return $matches | ForEach-Object {
    [pscustomobject]@{
      Code = $_.Groups["code"].Value
      Name = $_.Groups["name"].Value
      Category = $_.Groups["category"].Value
    }
  }
}

function Get-AddressPoint([string]$address) {
  $candidates = [Collections.Generic.List[string]]::new()
  $candidates.Add($address)
  if ($address -match '^(京都市.+?区).+?入(?<rest>.+)$') {
    $candidates.Add($Matches[1] + $Matches['rest'])
  }
  if ($address -match '^(京都市.+?区).+?(?:上ル|下ル)(?<rest>.+)$') {
    $candidates.Add($Matches[1] + $Matches['rest'])
  }

  foreach ($candidate in $candidates) {
    $encodedAddress = [uri]::EscapeDataString($candidate)
    $url = "https://msearch.gsi.go.jp/address-search/AddressSearch?q=$encodedAddress"

    for ($attempt = 1; $attempt -le 3; $attempt += 1) {
      try {
        $results = Invoke-RestMethod -Uri $url -TimeoutSec 30
        if ($results.Count -gt 0) {
          return $results[0]
        }
        break
      } catch {
        if ($attempt -eq 3) { throw }
        Start-Sleep -Seconds $attempt
      }
    }
  }

  throw "住所座標を取得できませんでした: $address"
}

function Get-FullAddress([string]$officialAddress, [string]$geocodedAddress) {
  $prefectureMatch = [regex]::Match($geocodedAddress, '^(北海道|東京都|京都府|大阪府|[^都道府県]+県)')
  if (-not $prefectureMatch.Success -or $officialAddress.StartsWith($prefectureMatch.Value)) {
    return $officialAddress
  }
  return $prefectureMatch.Value + $officialAddress
}

New-Item -ItemType Directory -Force -Path $workDir | Out-Null

try {
  if (-not $EdinetCsvPath) {
    $zipPath = Join-Path $workDir "Edinetcode.zip"
    $expandedPath = Join-Path $workDir "expanded"
    Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $zipPath
    Expand-Archive -LiteralPath $zipPath -DestinationPath $expandedPath -Force
    $EdinetCsvPath = Join-Path $expandedPath "EdinetcodeDlInfo.csv"
  }

  $metaLine = Get-Content -LiteralPath $EdinetCsvPath -Encoding oem -TotalCount 1
  $dateMatch = [regex]::Match($metaLine, '(?<year>\d{4})年(?<month>\d{2})月(?<day>\d{2})日')
  $sourceDate = if ($dateMatch.Success) {
    "$($dateMatch.Groups['year'].Value)-$($dateMatch.Groups['month'].Value)-$($dateMatch.Groups['day'].Value)"
  } else {
    (Get-Date).ToString("yyyy-MM-dd")
  }

  $edinetRows = Get-Content -LiteralPath $EdinetCsvPath -Encoding oem |
    Select-Object -Skip 1 |
    ConvertFrom-Csv

  $edinetByCode = @{}
  foreach ($row in $edinetRows) {
    $securityCode = [string]$row.'証券コード'
    if ($securityCode.Length -ge 4) {
      $edinetByCode[$securityCode.Substring(0, 4)] = $row
    }
  }

  $companies = @(Get-NikkeiCompanies)
  if ($companies.Count -ne 225) {
    throw "日経225銘柄を225件読み取れませんでした: $($companies.Count)件"
  }

  $cacheDirectory = Split-Path -Parent $CachePath
  New-Item -ItemType Directory -Force -Path $cacheDirectory | Out-Null
  $headquarters = if (Test-Path -LiteralPath $CachePath) {
    Get-Content -LiteralPath $CachePath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
  } else {
    [ordered]@{}
  }
  $failures = [Collections.Generic.List[object]]::new()

  foreach ($company in $companies) {
    $row = $edinetByCode[$company.Code]
    if (-not $row) {
      throw "EDINET住所が見つかりません: $($company.Code) $($company.Name)"
    }

    if ($headquarters.Contains($company.Code)) {
      $cachedLocation = $headquarters[$company.Code]
      $cachedLocation.officialName = [string]$row.'提出者名'
      $cachedLocation.address = Get-FullAddress ([string]$row.'所在地') ([string]$cachedLocation.address)
      $cachedLocation.corporateNumber = [string]$row.'提出者法人番号'
      continue
    }

    $queryAddress = if ($addressQueryOverrides.ContainsKey($company.Code)) {
      $addressQueryOverrides[$company.Code]
    } else {
      [string]$row.'所在地'
    }

    try {
      $point = Get-AddressPoint $queryAddress
    } catch {
      $failures.Add([pscustomobject]@{
        Code = $company.Code
        Name = $company.Name
        Address = [string]$row.'所在地'
      })
      continue
    }
    $longitude = [double]$point.geometry.coordinates[0]
    $latitude = [double]$point.geometry.coordinates[1]
    if ($latitude -lt 20 -or $latitude -gt 46 -or $longitude -lt 122 -or $longitude -gt 154) {
      throw "日本国外の座標が返されました: $($company.Code) $latitude,$longitude"
    }

    $headquarters[$company.Code] = [ordered]@{
      officialName = [string]$row.'提出者名'
      address = Get-FullAddress ([string]$row.'所在地') ([string]$point.properties.title)
      latitude = $latitude
      longitude = $longitude
      corporateNumber = [string]$row.'提出者法人番号'
    }

    $headquarters | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $CachePath -Encoding utf8NoBOM

    Write-Progress -Activity "本社住所を座標化" -Status "$($company.Code) $($company.Name)" -PercentComplete (($headquarters.Count / $companies.Count) * 100)
    Start-Sleep -Milliseconds 150
  }

  if ($failures.Count -gt 0) {
    $failures | Format-Table -AutoSize | Out-String | Write-Host
    throw "$($failures.Count)件の住所座標を取得できませんでした。"
  }

  if ($headquarters.Count -ne 225) {
    throw "本社座標が225件揃っていません: $($headquarters.Count)件"
  }

  $headquarters | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $CachePath -Encoding utf8NoBOM

  $json = $headquarters | ConvertTo-Json -Depth 4
  $header = @"
// Generated from the Financial Services Agency EDINET code list and GSI address search.
// Source date: $sourceDate. Run scripts/update-headquarters.ps1 to refresh.
export const NIKKEI_225_HEADQUARTERS =
"@
  $contents = $header + $json + ";`n"
  Set-Content -LiteralPath $outputPath -Value $contents -Encoding utf8NoBOM
  Write-Host "Generated $($headquarters.Count) headquarters in $outputPath"
} finally {
  $resolvedWorkDir = [IO.Path]::GetFullPath($workDir)
  if ($resolvedWorkDir.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedWorkDir)) {
    Remove-Item -LiteralPath $resolvedWorkDir -Recurse -Force
  }
}
