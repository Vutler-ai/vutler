#!/usr/bin/env python3
import sys
import re

def replace_method(content, new_method_content):
    # Find the _loadAssignments method
    pattern = r'(  async _loadAssignments\(\) \{.*?\n  \})'
    
    # Replace it with the new method
    result = re.sub(pattern, new_method_content.strip(), content, flags=re.DOTALL)
    return result

if __name__ == "__main__":
    # Read the original file content
    with open('/home/ubuntu/vutler/app/custom/services/agentRuntime.js', 'r') as f:
        content = f.read()
    
    # Read the new method content
    with open('/home/ubuntu/vutler/app/custom/new_loadAssignments.js', 'r') as f:
        new_method = f.read()
    
    # Replace the method
    updated_content = replace_method(content, new_method)
    
    # Write back to the file
    with open('/home/ubuntu/vutler/app/custom/services/agentRuntime.js', 'w') as f:
        f.write(updated_content)
    
    print("Method replaced successfully")