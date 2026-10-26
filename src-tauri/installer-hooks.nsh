; Keep the existing default application. Register WinMD as an Open With candidate.
; Do not write the default value of .md/.markdown, or the protected UserChoice key.
; Single-quoted NSIS strings contain literal double quotes. Do not add dollar signs.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\WinMD.md" "" "Markdown document (WinMD)"
  WriteRegStr HKCU "Software\Classes\WinMD.md\DefaultIcon" "" '"$INSTDIR\winmd.exe",0'
  WriteRegStr HKCU "Software\Classes\WinMD.md\shell\open\command" "" '"$INSTDIR\winmd.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\WinMD.markdown" "" "Markdown document (WinMD)"
  WriteRegStr HKCU "Software\Classes\WinMD.markdown\DefaultIcon" "" '"$INSTDIR\winmd.exe",0'
  WriteRegStr HKCU "Software\Classes\WinMD.markdown\shell\open\command" "" '"$INSTDIR\winmd.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\winmd.exe" "FriendlyAppName" "WinMD"
  WriteRegStr HKCU "Software\Classes\Applications\winmd.exe\shell\open\command" "" '"$INSTDIR\winmd.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\winmd.exe\SupportedTypes" ".md" ""
  WriteRegStr HKCU "Software\Classes\Applications\winmd.exe\SupportedTypes" ".markdown" ""
  WriteRegStr HKCU "Software\Classes\.md\OpenWithProgids" "WinMD.md" ""
  WriteRegStr HKCU "Software\Classes\.markdown\OpenWithProgids" "WinMD.markdown" ""
  WriteRegStr HKCU "Software\WinMD\Capabilities" "ApplicationName" "WinMD"
  WriteRegStr HKCU "Software\WinMD\Capabilities" "ApplicationDescription" "Markdown editor"
  WriteRegStr HKCU "Software\WinMD\Capabilities" "ApplicationIcon" '"$INSTDIR\winmd.exe",0'
  WriteRegStr HKCU "Software\WinMD\Capabilities\FileAssociations" ".md" "WinMD.md"
  WriteRegStr HKCU "Software\WinMD\Capabilities\FileAssociations" ".markdown" "WinMD.markdown"
  WriteRegStr HKCU "Software\RegisteredApplications" "WinMD" "Software\WinMD\Capabilities"
  ; Explicit interactive choice only. Never modify UserChoice or extension defaults.
  ${IfNot} ${Silent}
  ${AndIf} $PassiveMode != 1
  ${AndIf} $UpdateMode != 1
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "WinMDをインストールしました。$\r$\n$\r$\n.md をWinMDに関連付けるには、Windowsの既定のアプリ設定で選択してください。$\r$\n今すぐ設定画面を開きますか？" /SD IDNO IDNO winmd_skip_defaults
    ExecShell "open" "ms-settings:defaultapps?registeredAppUser=WinMD"
    winmd_skip_defaults:
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegValue HKCU "Software\Classes\.md\OpenWithProgids" "WinMD.md"
  DeleteRegValue HKCU "Software\Classes\.markdown\OpenWithProgids" "WinMD.markdown"
  DeleteRegKey HKCU "Software\Classes\WinMD.md"
  DeleteRegKey HKCU "Software\Classes\WinMD.markdown"
  DeleteRegKey HKCU "Software\Classes\Applications\winmd.exe"
  DeleteRegValue HKCU "Software\RegisteredApplications" "WinMD"
  DeleteRegKey HKCU "Software\WinMD\Capabilities"
  DeleteRegKey /ifempty HKCU "Software\WinMD"
!macroend
