import sys
import pyautogui

pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.05

def main():
    if len(sys.argv) < 2:
        print("Usage: mouseController.py <click|right_click|double_click|move> [x] [y]")
        sys.exit(1)
        
    action = sys.argv[1].lower()
    x = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] != "-1" else None
    y = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] != "-1" else None
    
    if action in ("click", "left_click"):
        if x is not None and y is not None:
            pyautogui.click(x=x, y=y)
            print(f"Clicked at ({x}, {y})")
        else:
            pyautogui.click()
            print("Clicked at current position")
    elif action == "right_click":
        if x is not None and y is not None:
            pyautogui.rightClick(x=x, y=y)
            print(f"Right-clicked at ({x}, {y})")
        else:
            pyautogui.rightClick()
            print("Right-clicked at current position")
    elif action == "double_click":
        if x is not None and y is not None:
            pyautogui.doubleClick(x=x, y=y)
            print(f"Double-clicked at ({x}, {y})")
        else:
            pyautogui.doubleClick()
            print("Double-clicked at current position")
    elif action == "move":
        if x is not None and y is not None:
            pyautogui.moveTo(x, y, duration=0.1)
            print(f"Moved to ({x}, {y})")
        else:
            print("Coordinates required for move")
    else:
        print(f"Unknown action: {action}")

if __name__ == "__main__":
    main()
