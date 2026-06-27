param(
  [string]$Keywords = '',
  [int]$X = 0,
  [int]$Y = 0,
  [int]$W = 0,
  [int]$H = 0
)

# Enumerates top-level windows, finds the first visible one whose title contains
# one of the (comma-separated) keywords, and moves it to the given physical-pixel
# rectangle. Restores the window first so a maximized/minimized window snaps too.
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class SnapWin {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int count);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

$keywordList = @($Keywords.ToLower().Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
$script:target = [IntPtr]::Zero

$callback = [SnapWin+EnumWindowsProc]{
  param($hWnd, $lParam)
  if ($script:target -ne [IntPtr]::Zero) { return $true }
  if (-not [SnapWin]::IsWindowVisible($hWnd)) { return $true }
  $len = [SnapWin]::GetWindowTextLength($hWnd)
  if ($len -eq 0) { return $true }
  $sb = New-Object System.Text.StringBuilder ($len + 1)
  [void][SnapWin]::GetWindowText($hWnd, $sb, $sb.Capacity)
  $titleLower = $sb.ToString().ToLower()
  if ($titleLower -eq 'copy to rtl') { return $true }
  foreach ($kw in $keywordList) {
    if ($titleLower.Contains($kw)) { $script:target = $hWnd; return $true }
  }
  return $true
}

[void][SnapWin]::EnumWindows($callback, [IntPtr]::Zero)

if ($script:target -ne [IntPtr]::Zero) {
  [void][SnapWin]::ShowWindow($script:target, 9) # SW_RESTORE
  [void][SnapWin]::MoveWindow($script:target, $X, $Y, $W, $H, $true)
  [void][SnapWin]::SetForegroundWindow($script:target)
  Write-Output 'moved'
} else {
  Write-Output 'notfound'
}
