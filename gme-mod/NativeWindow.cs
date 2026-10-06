// ─── Window focus helpers (Windows only) ─────────────────────────────────────
// Generating a map starts the Scenario Editor (tse) as a second process. If it
// ever ends up in front of the fullscreen game, Windows drops the game, and
// when tse exits the player is left on the desktop. These helpers (a) let tse
// take the foreground if it must, and (b) put the game back in front when the
// generation is over.

using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace GmeRmgMod
{
    internal static class NativeWindow
    {
        private const int SW_RESTORE = 9;
        private const byte VK_MENU = 0x12;
        private const uint KEYEVENTF_KEYUP = 0x2;

        [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern bool AllowSetForegroundWindow(int dwProcessId);
        [DllImport("user32.dll")] private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        /// <summary>The game's main window (zero when it can't be found).</summary>
        public static IntPtr GameWindow()
        {
            try
            {
                if (!OperatingSystem.IsWindows()) return IntPtr.Zero;
                using (Process self = Process.GetCurrentProcess()) return self.MainWindowHandle;
            }
            catch { return IntPtr.Zero; }
        }

        public static bool IsForeground(IntPtr window)
        {
            try { return OperatingSystem.IsWindows() && window != IntPtr.Zero && GetForegroundWindow() == window; }
            catch { return false; }
        }

        /// <summary>Lets `processId` (tse) take the foreground: only the foreground
        /// process may grant that right, and the game is it.</summary>
        public static void AllowForeground(int processId)
        {
            try { if (OperatingSystem.IsWindows()) AllowSetForegroundWindow(processId); }
            catch (Exception ex) { Plugin.Logger.LogWarning($"AllowSetForegroundWindow failed: {ex.Message}"); }
        }

        /// <summary>Brings `window` back to the front if something else holds the
        /// foreground. Returns true when it is in front afterwards.</summary>
        public static bool BringToFront(IntPtr window)
        {
            try
            {
                if (!OperatingSystem.IsWindows() || window == IntPtr.Zero) return false;
                if (GetForegroundWindow() == window) return true;
                if (IsIconic(window)) ShowWindow(window, SW_RESTORE);
                if (SetForegroundWindow(window) && GetForegroundWindow() == window) return true;
                // Windows refuses a process that didn't get the last input; a
                // tap on Alt counts as input and lifts that restriction.
                keybd_event(VK_MENU, 0, 0, UIntPtr.Zero);
                keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                SetForegroundWindow(window);
                return GetForegroundWindow() == window;
            }
            catch (Exception ex)
            {
                Plugin.Logger.LogWarning($"Bringing the game window to the front failed: {ex.Message}");
                return false;
            }
        }
    }
}
