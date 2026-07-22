; Dark theme installer customization
!macro customInstall
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\String Client" "DisplayIcon" "$INSTDIR\String Client.exe"
!macroend
