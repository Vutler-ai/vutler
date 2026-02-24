#!/usr/bin/env python3
import re

# Read the current file
with open('/tmp/snipara.js', 'r') as f:
    content = f.read()

# Read the new provisionProject function
with open('update_provision_project.js', 'r') as f:
    new_function = f.read()

# Replace the old provisionProject function with the new one
pattern = r'async function provisionProject\(workspaceId, opts = \{\}\) \{.*?\n\}'
replacement = new_function.strip()

updated_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

# Write the updated content back
with open('/tmp/snipara.js', 'w') as f:
    f.write(updated_content)

print("provisionProject function updated successfully!")