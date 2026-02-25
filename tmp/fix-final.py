c = open("/home/ubuntu/vutler/app/custom/admin/agent-detail.html").read()

# Restore inline onchange (CSP is now fixed)
old = 'id="providerSelect" ${providers.length===0?\'disabled\':\'\'}'
new = 'id="providerSelect" onchange="onProviderChange()" ${providers.length===0?\'disabled\':\'\'}'
if 'onchange="onProviderChange()"' not in c:
    c = c.replace(old, new)
    print("Restored inline onchange")
else:
    print("onchange already present")

# Remove duplicate addEventListener if present
old_listener = 'document.getElementById("providerSelect").addEventListener("change",function(){onProviderChange();});'
if old_listener in c:
    c = c.replace(old_listener, '')
    print("Removed duplicate addEventListener")

open("/home/ubuntu/vutler/app/custom/admin/agent-detail.html", "w").write(c)
print("Saved")
