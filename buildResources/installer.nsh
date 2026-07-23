; Post-install: set display icon for Add/Remove Programs
!macro customInstall
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\String Client" "DisplayIcon" "$INSTDIR\String Client.exe"
!macroend
