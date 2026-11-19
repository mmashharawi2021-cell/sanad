import sys
import pyautogui
import pyperclip

pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.05

def main():
    if len(sys.argv) < 2:
        print("Usage: keyboardController.py <type|press|hotkey> [args...]")
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "type":
        text = ""
        press_enter = False
        if len(sys.argv) > 3 and sys.argv[2] == "--file":
            filepath = sys.argv[3]
            with open(filepath, "r", encoding="utf-8") as f:
                text = f.read()
            if len(sys.argv) > 4 and sys.argv[4].lower() in ("true", "1", "enter"):
                press_enter = True
        elif len(sys.argv) > 2:
            text = sys.argv[2]
            if len(sys.argv) > 3 and sys.argv[3].lower() in ("true", "1", "enter"):
                press_enter = True

        pyperclip.copy(text)
        pyautogui.hotkey("ctrl", "v")
        if press_enter:
            pyautogui.press("enter")
        print(f"Typed text of length {len(text)}")

    elif command == "press":
        if len(sys.argv) < 3:
            print("No key provided to press.")
            sys.exit(1)
        key = sys.argv[2].lower()
        pyautogui.press(key)
        print(f"Pressed key: {key}")

    elif command == "hotkey":
        if len(sys.argv) < 3:
            print("No keys provided for hotkey.")
            sys.exit(1)
        raw_keys = sys.argv[2:]
        keys = []
        for r in raw_keys:
            keys.extend(r.split("+"))
        keys = [k.strip().lower() for k in keys if k.strip()]
        pyautogui.hotkey(*keys)
        print(f"Executed hotkey: {'+'.join(keys)}")

    else:
        print(f"Unknown command: {command}")

if __name__ == "__main__":
    main()
