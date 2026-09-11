with open("style.css", "r", encoding="utf-8") as f:
    c = f.read()

old = """.quick-tile {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; padding: 14px 6px; min-height: 76px; box-sizing: border-box;
}
.quick-tile .quick-tile-icon { font-size: 24px; }
.quick-tile .quick-tile-label { font-size: 11.5px; font-weight: 700; color: var(--text); text-align: center; }"""

new = """.quick-tile {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 4px; padding: 10px 4px; min-height: 80px; box-sizing: border-box;
}
.quick-tile .quick-tile-icon { font-size: 20px; }
.quick-tile .quick-tile-label {
  font-size: 10px; font-weight: 700; color: var(--text); text-align: center;
  line-height: 1.15; word-break: break-word; max-width: 100%;
}"""

assert old in c, "ancre quick-tile introuvable"
c = c.replace(old, new, 1)

with open("style.css", "w", encoding="utf-8") as f:
    f.write(c)

print("Patch style.css (quick-tile) termine.")
