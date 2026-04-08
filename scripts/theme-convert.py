#!/usr/bin/env python3
"""Mass-convert hardcoded colors to CSS variables across all .jsx files.
Preserves structure, only swaps color values."""
import os, re

# old → new translations (longest match first to avoid partial overlaps)
SUBS = [
    # Backgrounds
    (r"#0D0D0F", "var(--background)"),
    (r"#0d0d0f", "var(--background)"),
    (r"#141416", "var(--card)"),
    (r"#1A1A1E", "var(--muted)"),
    (r"#1a1a1e", "var(--muted)"),
    (r"#0E0B07", "var(--background)"),
    (r"#15110B", "var(--card)"),
    # Old purples → primary amber
    (r"#A78BFA", "var(--primary)"),
    (r"#a78bfa", "var(--primary)"),
    (r"#7C5CFC", "var(--primary)"),
    # Amber kept (was already amber)
    (r"#FBBF24", "var(--primary)"),
    (r"#fbbf24", "var(--primary)"),
    (r"#F59E0B", "var(--primary)"),
    (r"#f59e0b", "var(--primary)"),
    # Text rgba (white-on-dark) → foreground
    (r"rgba\(238,\s*238,\s*238,\s*0\.92\)", "var(--foreground)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.9\)", "var(--foreground)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.85\)", "var(--foreground)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.8\)", "var(--foreground)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.55\)", "var(--muted-foreground)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.5\)", "var(--muted-foreground)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.45\)", "var(--muted-foreground)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.4\)", "var(--muted-foreground)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.32\)", "var(--muted-foreground)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.3\)", "var(--muted-foreground)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.22\)", "var(--border)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.2\)", "var(--border)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.16\)", "var(--border)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.15\)", "var(--border)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.12\)", "var(--border)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.1\)", "var(--border)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.08\)", "var(--border)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.07\)", "var(--border)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.06\)", "var(--border)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.05\)", "var(--border)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.04\)", "var(--border)"),
    (r"rgba\(238,\s*238,\s*238,\s*0\.03\)", "var(--border)"),
    # 245,245,248 variants
    (r"rgba\(245,\s*245,\s*248,\s*0\.92\)", "var(--foreground)"),
    (r"rgba\(245,\s*245,\s*248,\s*0\.9\)", "var(--foreground)"),
    (r"rgba\(245,\s*245,\s*248,\s*0\.55\)", "var(--muted-foreground)"),
    (r"rgba\(245,\s*245,\s*248,\s*0\.5\)", "var(--muted-foreground)"),
    (r"rgba\(245,\s*245,\s*248,\s*0\.32\)", "var(--muted-foreground)"),
    (r"rgba\(245,\s*245,\s*248,\s*0\.16\)", "var(--border)"),
    (r"rgba\(245,\s*245,\s*248,\s*0\.12\)", "var(--border)"),
    (r"rgba\(245,\s*245,\s*248,\s*0\.06\)", "var(--border)"),
    # 167,139,250 (purple) → primary amber via accent variants
    (r"rgba\(167,\s*139,\s*250,\s*0\.5\)", "var(--primary)"),
    (r"rgba\(167,\s*139,\s*250,\s*0\.4\)", "var(--primary)"),
    (r"rgba\(167,\s*139,\s*250,\s*0\.3\)", "var(--ring)"),
    (r"rgba\(167,\s*139,\s*250,\s*0\.25\)", "var(--ring)"),
    (r"rgba\(167,\s*139,\s*250,\s*0\.2\)", "var(--accent)"),
    (r"rgba\(167,\s*139,\s*250,\s*0\.15\)", "var(--accent)"),
    (r"rgba\(167,\s*139,\s*250,\s*0\.12\)", "var(--accent)"),
    (r"rgba\(167,\s*139,\s*250,\s*0\.10\)", "var(--accent)"),
    (r"rgba\(167,\s*139,\s*250,\s*0\.1\)", "var(--accent)"),
    (r"rgba\(167,\s*139,\s*250,\s*0\.08\)", "var(--accent)"),
    (r"rgba\(167,\s*139,\s*250,\s*0\.06\)", "var(--accent)"),
    (r"rgba\(167,\s*139,\s*250,\s*0\.05\)", "var(--accent)"),
    (r"rgba\(167,\s*139,\s*250,\s*0\.04\)", "var(--accent)"),
    # Plain whites
    (r"rgba\(255,\s*255,\s*255,\s*0\.9\)", "var(--foreground)"),
    (r"rgba\(255,\s*255,\s*255,\s*0\.8\)", "var(--foreground)"),
    (r"rgba\(255,\s*255,\s*255,\s*0\.5\)", "var(--muted-foreground)"),
    (r"rgba\(255,\s*255,\s*255,\s*0\.4\)", "var(--muted-foreground)"),
    (r"rgba\(255,\s*255,\s*255,\s*0\.3\)", "var(--muted-foreground)"),
    (r"rgba\(255,\s*255,\s*255,\s*0\.2\)", "var(--border)"),
    (r"rgba\(255,\s*255,\s*255,\s*0\.15\)", "var(--border)"),
    (r"rgba\(255,\s*255,\s*255,\s*0\.12\)", "var(--border)"),
    (r"rgba\(255,\s*255,\s*255,\s*0\.10\)", "var(--border)"),
    (r"rgba\(255,\s*255,\s*255,\s*0\.1\)", "var(--border)"),
    (r"rgba\(255,\s*255,\s*255,\s*0\.08\)", "var(--border)"),
    (r"rgba\(255,\s*255,\s*255,\s*0\.06\)", "var(--border)"),
    (r"rgba\(255,\s*255,\s*255,\s*0\.05\)", "var(--border)"),
    (r"rgba\(255,\s*255,\s*255,\s*0\.04\)", "var(--border)"),
    (r"rgba\(255,\s*255,\s*255,\s*0\.03\)", "var(--border)"),
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
    total = 0
    for dirpath, dirs, files in os.walk(root):
        for f in files:
            if f.endswith(('.jsx', '.js')):
                total += 1
                if convert_file(os.path.join(dirpath, f)):
                    converted += 1
    print(f'Converted {converted} of {total} files')

if __name__ == '__main__':
    main()
