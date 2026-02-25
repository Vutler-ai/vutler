import sys
content = open("/home/ubuntu/vutler/app/custom/admin/agent-detail.html").read()

catalog = 'const MODEL_CATALOG={anthropic:[{id:"claude-sonnet-4-20250514",name:"Claude Sonnet 4"},{id:"claude-haiku-4-20250414",name:"Claude Haiku 4"},{id:"claude-opus-4-20250115",name:"Claude Opus 4"}],openai:[{id:"gpt-4o",name:"GPT-4o"},{id:"gpt-4o-mini",name:"GPT-4o Mini"},{id:"o3",name:"o3"}],groq:[{id:"llama-3.3-70b-versatile",name:"Llama 3.3 70B"},{id:"mixtral-8x7b-32768",name:"Mixtral 8x7B"}],minimax:[{id:"MiniMax-M2.5-highspeed",name:"MiniMax M2.5"}],google:[{id:"gemini-2.5-pro",name:"Gemini 2.5 Pro"},{id:"gemini-2.5-flash",name:"Gemini 2.5 Flash"}]};'

if "MODEL_CATALOG" not in content:
    content = content.replace("function onProviderChange", catalog + "function onProviderChange")
    print("Catalog added")

# Find and replace onProviderChange
idx = content.find("function onProviderChange")
if idx < 0:
    print("NOT FOUND")
    sys.exit(1)

# Check if it has parameter
snippet = content[idx:idx+100]
print(f"Found: {snippet[:60]}")

if "function onProviderChange(assign.model)" in content:
    old = "function onProviderChange(assign.model)"
    # This is a call, not definition - find the definition
    pass

# Find the actual function definition (after catalog)
cat_end = content.find(catalog) + len(catalog) if catalog in content else 0
func_start = content.find("function onProviderChange", cat_end)
if func_start < 0:
    print("Function not found after catalog")
    sys.exit(1)

# Get the function signature
sig_end = content.find("{", func_start)
sig = content[func_start:sig_end+1]
print(f"Signature: {sig}")

# Find matching closing brace - count braces
depth = 1
i = sig_end + 1
while i < len(content) and depth > 0:
    if content[i] == "{":
        depth += 1
    elif content[i] == "}":
        depth -= 1
    i += 1

old_func = content[func_start:i]
print(f"Old function length: {len(old_func)}")

new_func = 'function onProviderChange(preselect){var sel=document.getElementById("providerSelect");var opt=sel.options[sel.selectedIndex];var pType=opt?opt.getAttribute("data-type"):"";var ms=document.getElementById("modelSelect");ms.innerHTML="";var defOpt=document.createElement("option");defOpt.value="";defOpt.textContent="-- Select model --";ms.appendChild(defOpt);var models=MODEL_CATALOG[pType]||[];models.forEach(function(m){var o=document.createElement("option");o.value=m.id;o.textContent=m.name;if(preselect&&preselect===m.id)o.selected=true;ms.appendChild(o);});}'

content = content[:func_start] + new_func + content[i:]
print("Function replaced")

open("/home/ubuntu/vutler/app/custom/admin/agent-detail.html", "w").write(content)
print("Saved")
