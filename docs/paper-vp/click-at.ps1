param(
  [int]$RelX,
  [int]$RelY,
  [int]$MinWidth = 800,
  [int]$MinHeight = 500
)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W2 {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool EnumWindows(CB cb, IntPtr l);
  public delegate bool CB(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
}
public struct R { public int Left, Top, Right, Bottom; }
"@
$target = [IntPtr]::Zero
$cb = {
  param($h, $l)
  $sb = New-Object System.Text.StringBuilder 256
  [W2]::GetWindowText($h, $sb, 256) | Out-Null
  if ($sb.ToString() -eq "Visual Python" -and [W2]::IsWindowVisible($h)) {
    $r = New-Object R
    [W2]::GetWindowRect($h, [ref]$r) | Out-Null
    if (($r.Right - $r.Left) -ge $MinWidth -and ($r.Bottom - $r.Top) -ge $MinHeight) { $script:target = $h; return $false }
  }
  return $true
}
[W2]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
if ($target -eq [IntPtr]::Zero) { Write-Error "window not found"; exit 1 }
[W2]::SetForegroundWindow($target) | Out-Null
Start-Sleep -Milliseconds 500
$r = New-Object R
[W2]::GetWindowRect($target, [ref]$r) | Out-Null
$x = $r.Left + $RelX; $y = $r.Top + $RelY
[W2]::SetCursorPos($x, $y) | Out-Null
Start-Sleep -Milliseconds 250
[W2]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)   # LEFTDOWN
[W2]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)   # LEFTUP
Start-Sleep -Milliseconds 900
Write-Output "clicked at ($x,$y) win=($($r.Left),$($r.Top))"
