#!/usr/bin/env python3
"""Pass 2: catch-all alpha values for remaining hardcoded colors."""
import os, re

SUBS = [
    # Wildcard alphas — anything 0.X for whites/light text → semantic vars based on alpha
    # High alpha (>0.6) = foreground text
    (r"rgba\(238,\s*238,\s*238,\s*0\.[6-9]\d*\)", "var(--foreground)"),
    (r"rgba\(245,\s*245,\s*248,\s*0\.[6-9]\d*\)", "var(--foreground)"),
    (r"rgba\(255,\s*255,\s*255,\s*0\.[6-9]\d*\)", "var(--foreground)"),
    # Medium alpha (0.3-0.5) = muted text
    (r"rgba\(238,\s*238,\s*238,\s*0\.[3-5]\d*\)", "var(--muted-foreground)"),
    (r"rgba\(245,\s*245,\s*248,\s*0\.[3-5]\d*\)", "var(--muted-foreground)"),
    (r"rgba\(255,\s*255,\s*255,\s*0\.[3-5]\d*\)", "var(--muted-foreground)"),
    # Low alpha (0.0-0.2) = border
    (r"rgba\(238,\s*238,\s*238,\s*0\.[0-2]\d*\)", "var(--border)"),
    (r"rgba\(245,\s*245,\s*248,\s*0\.[0-2]\d*\)", "var(--border)"),
    (r"rgba\(255,\s*255,\s*255,\s*0\.[0-2]\d*\)", "var(--border)"),
    # Purple (167,139,250) — high alpha = primary, low = accent
    (r"rgba\(167,\s*139,\s*250,\s*0\.[6-9]\d*\)", "var(--primary)"),
    (r"rgba\(167,\s*139,\s*250,\s*0\.[3-5]\d*\)", "var(--ring)"),
    (r"rgba\(167,\s*139,\s*250,\s*0\.[0-2]\d*\)", "var(--accent)"),
    # Black overlays — keep as muted
    (r"rgba\(0,\s*0,\s*0,\s*0\.[6-9]\d*\)", "var(--foreground)"),
    # Old hex literals that may still be lurking
    (r"#0F0F0F", "var(--background)"),
    (r"#0f0f0f", "var(--background)"),
    (r"#171717", "var(--background)"),
    (r"#262626", "var(--card)"),
    (r"#404040", "var(--border)"),
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
    print(f'Pass 2 converted {converted} files')

if __name__ == '__main__':
    main()
