Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot "..\extension\icons"
$outDir = [System.IO.Path]::GetFullPath($outDir)
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

function New-RoundedRect {
  param([float]$x, [float]$y, [float]$w, [float]$h, [float]$r)
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

foreach ($size in 16, 32, 48, 128) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::Transparent)

  $pad = [Math]::Max(1, [int]($size * 0.06))
  $radius = [Math]::Max(2, [int]($size * 0.22))
  $path = New-RoundedRect $pad $pad ($size - 2 * $pad) ($size - 2 * $pad) $radius
  $bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 30, 48, 82))
  $g.FillPath($bg, $path)

  $accent = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 96, 165, 250))
  $barH = [Math]::Max(2, [int]($size * 0.10))
  $g.FillRectangle($accent, $pad, ($size - $pad - $barH), ($size - 2 * $pad), $barH)

  $fontSize = [float]($size * 0.52)
  $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $white = [System.Drawing.Brushes]::White
  $rect = New-Object System.Drawing.RectangleF(0, 0, $size, ($size - $barH))
  $g.DrawString("Z", $font, $white, $rect, $fmt)

  $file = Join-Path $outDir "$size.png"
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)

  $g.Dispose(); $bmp.Dispose(); $font.Dispose(); $bg.Dispose(); $accent.Dispose(); $path.Dispose()
  Write-Output "wrote $file"
}
