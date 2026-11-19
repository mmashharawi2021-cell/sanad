import sys
import time
import ctypes
import webbrowser
from ctypes import wintypes
import urllib.request
import json

# Windows API constants
MOD_ALT = 0x0001
MOD_CONTROL = 0x0002
MOD_SHIFT = 0x0004
MOD_WIN = 0x0008
MOD_NOREPEAT = 0x4000

VK_S = 0x53
VK_SPACE = 0x20

HOTKEY_SANAD_S = 101

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

def bring_sanad_to_front():
    found = False
    
    def enum_windows_proc(hwnd, lParam):
        nonlocal found
        if user32.IsWindowVisible(hwnd):
            length = user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                buff = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buff, length + 1)
                title = buff.value
                if "سند" in title or "SANAD" in title or "opencode" in title or "localhost:3000" in title:
                    user32.ShowWindow(hwnd, 9) # SW_RESTORE
                    user32.SetForegroundWindow(hwnd)
                    found = True
                    return False
        return True

    EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    proc = EnumWindowsProc(enum_windows_proc)
    user32.EnumWindows(proc, 0)
    
    if not found:
        webbrowser.open("http://localhost:3000")

def main():
    print("Initializing SANAD Global Hotkey Listener (Ctrl + Alt + S)...")
    
    # Register Ctrl + Alt + S
    if not user32.RegisterHotKey(None, HOTKEY_SANAD_S, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, VK_S):
        print("Warning: Could not register Ctrl+Alt+S, trying Alt+S...")
        user32.RegisterHotKey(None, HOTKEY_SANAD_S, MOD_ALT | MOD_NOREPEAT, VK_S)
        
    print("SANAD Global Hotkey is ACTIVE! Press Ctrl + Alt + S from anywhere to summon SANAD.")
    
    msg = wintypes.MSG()
    try:
        while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) != 0:
            if msg.message == 0x0312: # WM_HOTKEY
                if msg.wParam == HOTKEY_SANAD_S:
                    print("\n[Global Hotkey Triggered] Summoning SANAD...")
                    bring_sanad_to_front()
            user32.TranslateMessage(ctypes.byref(msg))
            user32.DispatchMessageW(ctypes.byref(msg))
    except KeyboardInterrupt:
        pass
    finally:
        user32.UnregisterHotKey(None, HOTKEY_SANAD_S)
        print("SANAD Global Hotkey listener terminated.")

if __name__ == "__main__":
    main()
