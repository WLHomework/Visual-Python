param(
  [string]$OutFile = "shot.png",
  [int]$MinWidth = 800,
  [int]$MinHeight = 500
)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
}
public struct RECT { public int Left, Top, Right, Bottom; }
"@

$target = [IntPtr]::Zero
$cb = {
  param($h, $l)
  $sb = New-Object System.Text.StringBuilder 256
  [Win32]::GetWindowText($h, $sb, 256) | Out-Null
  $title = $sb.ToString()
  if ($title -eq "Visual Python" -and [Win32]::IsWindowVisible($h)) {
    $r = New-Object RECT
    [Win32]::GetWindowRect($h, [ref]$r) | Out-Null
    $w = $r.Right - $r.Left; $ht = $r.Bottom - $r.Top
    if ($w -ge $MinWidth -and $ht -ge $MinHeight) { $script:target = $h; return $false }
  }
  return $true
}
[Win32]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
if ($target -eq [IntPtr]::Zero) { Write-Error "window not found"; exit 1 }

[Win32]::SetForegroundWindow($target) | Out-Null
Start-Sleep -Milliseconds 800
$r = New-Object RECT
[Win32]::GetWindowRect($target, [ref]$r) | Out-Null
$w = $r.Right - $r.Left; $ht = $r.Bottom - $r.Top
$bmp = New-Object System.Drawing.Bitmap $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
$g.Dispose()
$bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "saved $OutFile ${w}x${ht} at ($($r.Left),$($r.Top))"
