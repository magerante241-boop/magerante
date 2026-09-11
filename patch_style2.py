with open("style.css", "r", encoding="utf-8") as f:
    c = f.read()

old = """.bottom-nav-item {
  color: #fff;
  background: none; border: none;
  font-size: 11px; display: flex; flex-direction: column;
  align-items: center; gap: 2px; padding: 4px 6px; cursor: pointer;
}
.bottom-nav-icon { font-size: 18px; }"""
new = """.bottom-nav-item {
  color: #fff;
  background: none; border: none;
  flex: 1; min-width: 0;
  font-size: 9px; display: flex; flex-direction: column;
  align-items: center; gap: 2px; padding: 4px 2px; cursor: pointer;
}
.bottom-nav-item span:last-child {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
}
.bottom-nav-icon { font-size: 15px; }"""
assert old in c, "ancre bottom-nav-item introuvable"
c = c.replace(old, new, 1)

with open("style.css", "w", encoding="utf-8") as f:
    f.write(c)

print("Patch style.css termine.")
