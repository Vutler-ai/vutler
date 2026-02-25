import re

with open("/home/ubuntu/vutler/app/custom/frontend/knowledge.html") as f:
    lines = f.readlines()

# Find the nav end and main start, remove everything between
output = []
skip = False
for i, line in enumerate(lines):
    if '</nav>' in line and 'topnav' not in line:
        output.append(line)
        continue
    if 'user-status' in line or 'btn-logout' in line or ('</div>' in line and skip):
        skip = True
        if line.strip() == '</div>' and i > 0 and 'btn-logout' in ''.join(lines[max(0,i-5):i]):
            skip = False
        continue
    if '<!-- Sidebar -->' in line:
        continue
    output.append(line)

with open("/home/ubuntu/vutler/app/custom/frontend/knowledge.html", "w") as f:
    f.writelines(output)
print(f"Cleaned: {len(lines)} -> {len(output)} lines")
