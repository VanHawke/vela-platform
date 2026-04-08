#!/usr/bin/env python3
"""Pass 3: catch the dark-glass leftovers in KikoChat and friends."""
import os, re

SUBS = [
    # Dark glass surfaces (was the floating pill / input bar background)
    (r"rgba\(25,\s*25,\s*25,\s*0\.[0-9]+\)", "var(--card)"),
    (r"rgba\(20,\s*20,\s*24,\s*0\.[0-9]+\)", "var(--card)"),
    # Specific dark hex leftovers
    (r"#3A3A3E", "var(--muted-foreground)"),
    (r"#3a3a3e", "var(--muted-foreground)"),
    (r"#555558", "var(--muted-foreground)"),
    (r"#191919", "var(--card)"),
    (r"#1f1f23", "var(--card)"),
    (r"#1F1F23", "var(--card)"),
    # Black overlays mid-low
    (r"rgba\(0,\s*0,\s*0,\s*0\.[3-5]\d*\)", "var(--border)"),
    (r"rgba\(0,\s*0,\s*0,\s*0\.[1-2]\d*\)", "var(--border)"),
]

def convert_file(path):
    with open(path) as f:
        content = f.read()
    original = content
    for pattern, replacement in SUBS:
        content = re.sub(pattern, replacement, content)
    if content != original:
        with open(path, 'w') as f:
            f.write(content)
        return True
    return False

def main():
    root = '/Users/sunny/Desktop/vela-platform/src'
    converted = 0
    for dirpath, dirs, files in os.walk(root):
        for f in files:
            if f.endswith(('.jsx', '.js')):
                if convert_file(os.path.join(dirpath, f)):
                    converted += 1
    print(f'Pass 3 converted {converted} files')

if __name__ == '__main__':
    main()
