; ─── Installer hooks: game folder + optional map editor mod ──────────────────
; Included by Tauri's NSIS installer (tauri.windows.conf.json →
; bundle.windows.nsis.installerHooks). After the app is installed:
;   1. Find the game folder (`app.exe --detect-game-dir`, src-tauri/src/game_dir.rs),
;      or let the user pick it; store it in $INSTDIR\game-path.txt, which the
;      app reads on start (Core.zip, RMG schema, thumbnails).
;   2. Offer the map editor mod (gme-mod/). On yes: install BepInEx into the
;      game if missing, copy the mod DLL, and store this app's path in the
;      registry (TseExecutable) for the mod. The answer is remembered;
;      passive/silent runs (auto-updates) never ask and just refresh an
;      installed mod.
;
; This file is included BEFORE Tauri's own !defines (MANUFACTURER,
; PRODUCTNAME, MAINBINARYNAME), so the functions below must not use them —
; the hook macros (expanded later, where the defines exist) put the values
; into $GmeExe / $GmeRegKey first.

!define GME_MOD_GUID "com.mimiasei.oldenera.externalrmg"

Var GmeGameDir
Var GmeExe     ; $INSTDIR\<main binary>.exe
Var GmeRegKey  ; HKCU key for this app's own values (read by the mod)

Function GmeIsQuiet
  ; Pushes 1 for passive (/P, used by auto-update) or silent runs, else 0.
  ${If} $PassiveMode = 1
  ${OrIf} ${Silent}
    Push 1
  ${Else}
    Push 0
  ${EndIf}
FunctionEnd

Function GmeDetectGameDir
  StrCpy $GmeGameDir ""
  InitPluginsDir
  Delete "$PLUGINSDIR\gme-game-dir.txt"
  ExecWait '"$GmeExe" --detect-game-dir --out "$PLUGINSDIR\gme-game-dir.txt"'
  ClearErrors
  FileOpen $0 "$PLUGINSDIR\gme-game-dir.txt" r
  ${IfNot} ${Errors}
    FileRead $0 $GmeGameDir
    FileClose $0
  ${EndIf}

  Call GmeIsQuiet
  Pop $1
  ${If} $GmeGameDir == ""
  ${AndIf} $1 = 0
    MessageBox MB_YESNO|MB_ICONQUESTION "Heroes of Might and Magic: Olden Era was not found automatically.$\n$\nThe editor reads the game's data files. Locate the game's install folder now?" IDNO gme_detect_done
    gme_browse:
    nsDialogs::SelectFolderDialog "Select the Heroes of Might and Magic: Olden Era folder (the one with HeroesOldenEra.exe)" "$PROGRAMFILES"
    Pop $0
    ${If} $0 == "error"
      Goto gme_detect_done
    ${EndIf}
    ${If} ${FileExists} "$0\HeroesOldenEra.exe"
      StrCpy $GmeGameDir $0
    ${Else}
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "HeroesOldenEra.exe is not in that folder." IDRETRY gme_browse
    ${EndIf}
    gme_detect_done:
  ${EndIf}

  ${If} $GmeGameDir != ""
    FileOpen $0 "$INSTDIR\game-path.txt" w
    FileWrite $0 $GmeGameDir
    FileClose $0
  ${EndIf}
FunctionEnd

Function GmeInstallMod
  ${If} $GmeGameDir == ""
    Return
  ${EndIf}

  ReadRegStr $1 HKCU "$GmeRegKey" "GmeMod"
  Call GmeIsQuiet
  Pop $2
  ${If} $2 = 1
    ; Auto-update: keep the earlier choice, never ask.
    ${If} $1 != "1"
      Return
    ${EndIf}
  ${Else}
    MessageBox MB_YESNO|MB_ICONQUESTION "Install the random map generator into the game's map editor?$\n$\nThis adds Players, Richness, Complexity, Difficulty and Water options to the map editor's 'Generate map' dialog and generates the map with this editor.$\n$\nBepInEx (a mod loader) will be installed into the game folder if it isn't there yet." IDYES gme_install_yes
    WriteRegStr HKCU "$GmeRegKey" "GmeMod" "0"
    Return
    gme_install_yes:
  ${EndIf}
  WriteRegStr HKCU "$GmeRegKey" "GmeMod" "1"
  WriteRegStr HKCU "$GmeRegKey" "GmeGameDir" $GmeGameDir
  ; Read by the mod (Plugin.cs). Registry, not a config file: NSIS writes
  ; files in the ANSI code page, which garbles non-ASCII user folder names.
  WriteRegStr HKCU "$GmeRegKey" "TseExecutable" $GmeExe

  StrCpy $3 0
  ${IfNot} ${FileExists} "$GmeGameDir\BepInEx\core\BepInEx.Unity.IL2CPP.dll"
    CopyFiles /SILENT "$INSTDIR\gme-mod\bepinex\*.*" "$GmeGameDir"
    StrCpy $3 1
  ${EndIf}

  CreateDirectory "$GmeGameDir\BepInEx\plugins"
  CreateDirectory "$GmeGameDir\BepInEx\config"
  ; An earlier hand-built version of the same mod (same plugin id) — BepInEx loads only one.
  Delete "$GmeGameDir\BepInEx\plugins\mapEditorMod.dll"
  CopyFiles /SILENT "$INSTDIR\gme-mod\plugins\GmeRmgMod.dll" "$GmeGameDir\BepInEx\plugins"

  ${If} $3 = 1
  ${AndIf} $2 = 0
    MessageBox MB_OK|MB_ICONINFORMATION "BepInEx was installed into the game folder. The first game start afterwards takes a few minutes while BepInEx prepares itself."
  ${EndIf}
FunctionEnd

!macro NSIS_HOOK_POSTINSTALL
  StrCpy $GmeExe "$INSTDIR\${MAINBINARYNAME}.exe"
  StrCpy $GmeRegKey "Software\${MANUFACTURER}\${PRODUCTNAME}"
  Call GmeDetectGameDir
  Call GmeInstallMod
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Updates run the old uninstaller with /UPDATE — keep the mod then.
  ${If} $UpdateMode <> 1
    ReadRegStr $0 HKCU "Software\${MANUFACTURER}\${PRODUCTNAME}" "GmeGameDir"
    ${If} $0 != ""
      Delete "$0\BepInEx\plugins\GmeRmgMod.dll"
      Delete "$0\BepInEx\config\${GME_MOD_GUID}.cfg"
    ${EndIf}
    DeleteRegValue HKCU "Software\${MANUFACTURER}\${PRODUCTNAME}" "TseExecutable"
    Delete "$INSTDIR\game-path.txt"
  ${EndIf}
!macroend
