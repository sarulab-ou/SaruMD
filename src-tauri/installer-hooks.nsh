; Keep the existing default application. Register SaruMD as an Open With candidate.
; Do not write the default value of .md/.markdown, or the protected UserChoice key.
; Single-quoted NSIS strings contain literal double quotes. Do not add dollar signs.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\SaruMD.md" "" "Markdown document (SaruMD)"
  WriteRegStr HKCU "Software\Classes\SaruMD.md\DefaultIcon" "" '"$INSTDIR\SaruMD.exe",0'
  WriteRegStr HKCU "Software\Classes\SaruMD.md\shell\open\command" "" '"$INSTDIR\SaruMD.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\SaruMD.markdown" "" "Markdown document (SaruMD)"
  WriteRegStr HKCU "Software\Classes\SaruMD.markdown\DefaultIcon" "" '"$INSTDIR\SaruMD.exe",0'
  WriteRegStr HKCU "Software\Classes\SaruMD.markdown\shell\open\command" "" '"$INSTDIR\SaruMD.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\SaruMD.exe" "FriendlyAppName" "SaruMD"
  WriteRegStr HKCU "Software\Classes\Applications\SaruMD.exe\shell\open\command" "" '"$INSTDIR\SaruMD.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\SaruMD.exe\SupportedTypes" ".md" ""
  WriteRegStr HKCU "Software\Classes\Applications\SaruMD.exe\SupportedTypes" ".markdown" ""
  WriteRegStr HKCU "Software\Classes\.md\OpenWithProgids" "SaruMD.md" ""
  WriteRegStr HKCU "Software\Classes\.markdown\OpenWithProgids" "SaruMD.markdown" ""
  WriteRegStr HKCU "Software\SaruMD\Capabilities" "ApplicationName" "SaruMD"
  WriteRegStr HKCU "Software\SaruMD\Capabilities" "ApplicationDescription" "Markdown editor"
  WriteRegStr HKCU "Software\SaruMD\Capabilities" "ApplicationIcon" '"$INSTDIR\SaruMD.exe",0'
  WriteRegStr HKCU "Software\SaruMD\Capabilities\FileAssociations" ".md" "SaruMD.md"
  WriteRegStr HKCU "Software\SaruMD\Capabilities\FileAssociations" ".markdown" "SaruMD.markdown"
  WriteRegStr HKCU "Software\RegisteredApplications" "SaruMD" "Software\SaruMD\Capabilities"
  ; Explicit interactive choice only. Never modify UserChoice or extension defaults.
  ${IfNot} ${Silent}
  ${AndIf} $PassiveMode != 1
  ${AndIf} $UpdateMode != 1
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "SaruMDをインストールしました。$\r$\n$\r$\n.md をSaruMDに関連付けるには、Windowsの既定のアプリ設定で選択してください。$\r$\n今すぐ設定画面を開きますか？" /SD IDNO IDNO sarumd_skip_defaults
    ExecShell "open" "ms-settings:defaultapps?registeredAppUser=SaruMD"
    sarumd_skip_defaults:
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegValue HKCU "Software\Classes\.md\OpenWithProgids" "SaruMD.md"
  DeleteRegValue HKCU "Software\Classes\.markdown\OpenWithProgids" "SaruMD.markdown"
  DeleteRegKey HKCU "Software\Classes\SaruMD.md"
  DeleteRegKey HKCU "Software\Classes\SaruMD.markdown"
  DeleteRegKey HKCU "Software\Classes\Applications\SaruMD.exe"
  DeleteRegValue HKCU "Software\RegisteredApplications" "SaruMD"
  DeleteRegKey HKCU "Software\SaruMD\Capabilities"
  DeleteRegKey /ifempty HKCU "Software\SaruMD"
!macroend
