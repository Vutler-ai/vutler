import sys

with open("frontend/src/components/sidebar.tsx", "r") as f:
    content = f.read()

sandbox_entry = '''        {
          label: 'Sandbox',
          href: '/sandbox',
          icon: (
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          ),
        },'''

# Find "label: 'Clients'" and insert Sandbox after the Clients block
marker = "label: 'Clients',"
idx = content.find(marker)
if idx == -1:
    print("ERROR: Could not find Clients marker")
    sys.exit(1)

# Find closing "}," of the Clients entry
# Count from idx, find the pattern "},\n" that closes this entry
search_from = idx
brace_count = 0
found_open = False
i = search_from
while i < len(content):
    if content[i] == '{' and not found_open:
        # Go back to find the opening { of this entry
        pass
    i += 1

# Simpler: find the next occurrence of "        }," after the Clients label
close_marker = "        },"
close_idx = content.find(close_marker, idx)
if close_idx == -1:
    print("ERROR: Could not find close marker")
    sys.exit(1)

insert_pos = close_idx + len(close_marker)
content = content[:insert_pos] + "\n" + sandbox_entry + content[insert_pos:]

with open("frontend/src/components/sidebar.tsx", "w") as f:
    f.write(content)
print("OK - Sidebar patched")
