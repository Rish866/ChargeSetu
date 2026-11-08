#!/usr/bin/env python3
"""Tiny UI Automator helper for the Android smoke test.

  ui.py find  <regex>   -> prints "x y" of the first visible node whose text/content-desc matches
  ui.py has   <regex>   -> exit 0 if any node matches
  ui.py texts           -> prints all visible texts (for logs)
Reads the dump XML from stdin.
"""
import re, sys, xml.etree.ElementTree as ET

def nodes(root):
    for n in root.iter("node"):
        label = (n.get("text") or "") + " " + (n.get("content-desc") or "") + " " + (n.get("hint") or "")
        b = re.findall(r"\d+", n.get("bounds") or "")
        if len(b) == 4:
            x1, y1, x2, y2 = map(int, b)
            if x2 > x1 and y2 > y1:
                yield label.strip(), ((x1 + x2) // 2, (y1 + y2) // 2), n

def main():
    cmd = sys.argv[1]
    data = sys.stdin.read()
    start = data.find("<?xml")
    if start < 0:
        sys.exit(2)
    root = ET.fromstring(data[start:data.rfind(">") + 1])
    if cmd == "texts":
        print(" | ".join(l for l, _, _ in nodes(root) if l)[:4000])
        return
    rx = re.compile(sys.argv[2], re.I)
    for label, (x, y), _ in nodes(root):
        if rx.search(label):
            if cmd == "find":
                print(x, y)
            return
    sys.exit(1)

main()
