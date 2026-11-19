using System;
using System.Runtime.InteropServices;

public class MouseHelper {
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    private const uint MOUSEEVENTF_LEFTDOWN = 0x02;
    private const uint MOUSEEVENTF_LEFTUP = 0x04;
    private const uint MOUSEEVENTF_RIGHTDOWN = 0x08;
    private const uint MOUSEEVENTF_RIGHTUP = 0x10;

    public static void LeftClick(int x = -1, int y = -1) {
        if (x >= 0 && y >= 0) SetCursorPos(x, y);
        mouse_event(MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
    }

    public static void RightClick(int x = -1, int y = -1) {
        if (x >= 0 && y >= 0) SetCursorPos(x, y);
        mouse_event(MOUSEEVENTF_RIGHTDOWN | MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
    }

    public static void DoubleClick(int x = -1, int y = -1) {
        LeftClick(x, y);
        System.Threading.Thread.Sleep(80);
        LeftClick(x, y);
    }

    public static void MoveTo(int x, int y) {
        SetCursorPos(x, y);
    }
}
