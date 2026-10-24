$sig = @"
using System;
using System.Runtime.InteropServices;
public class CredMan {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public int Flags;
    public int Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize;
    public IntPtr CredentialBlob;
    public int Persist;
    public int AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredEnumerate(string filter, uint flags, out uint count, out IntPtr pCredentials);
  [DllImport("advapi32.dll")]
  public static extern void CredFree(IntPtr cred);
}
"@
Add-Type -TypeDefinition $sig

$count = [uint32]0
$ptr = [IntPtr]::Zero
if (-not [CredMan]::CredEnumerate($null, 0, [ref]$count, [ref]$ptr)) {
  Write-Output "CredEnumerate failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
  exit 1
}
$credSize = [Runtime.InteropServices.Marshal]::SizeOf([type][CredMan+CREDENTIAL])
for ($i = 0; $i -lt $count; $i++) {
  $credPtr = [Runtime.InteropServices.Marshal]::ReadIntPtr($ptr, $i * [IntPtr]::Size)
  $cred = [Runtime.InteropServices.Marshal]::PtrToStructure($credPtr, [type][CredMan+CREDENTIAL])
  if ($cred.TargetName -like "*Visual Python*" -or $cred.UserName -like "*Visual Python*") {
    $blob = ""
    if ($cred.CredentialBlobSize -gt 0 -and $cred.CredentialBlob -ne [IntPtr]::Zero) {
      $bytes = New-Object byte[] $cred.CredentialBlobSize
      [Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $cred.CredentialBlobSize)
      $blob = [Text.Encoding]::UTF8.GetString($bytes)
    }
    Write-Output ("TARGET=" + $cred.TargetName + " | USER=" + $cred.UserName + " | LEN=" + $cred.CredentialBlobSize)
    if ($env:DUMP_AI_KEY -eq "1" -and $blob) {
      $out = "E:\visual-python\.local-ai-key.txt"
      [IO.File]::WriteAllText($out, $blob)
      Write-Output "KEY_WRITTEN=$out"
    }
  }
}
[CredMan]::CredFree($ptr) | Out-Null
Write-Output "DONE total=$count"
