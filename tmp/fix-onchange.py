c = open("/home/ubuntu/vutler/app/custom/admin/agent-detail.html").read()

# Remove inline onchange (blocked by CSP)
c = c.replace(' onchange="onProviderChange()"', '')
print("Removed inline onchange")

# Add addEventListener after the existing onProviderChange(assign.model) call
old_call = "onProviderChange(assign.model);"
new_call = old_call + 'document.getElementById("providerSelect").addEventListener("change",function(){onProviderChange();});'
c = c.replace(old_call, new_call, 1)  # only first occurrence
print("Added addEventListener")

open("/home/ubuntu/vutler/app/custom/admin/agent-detail.html", "w").write(c)
print("Saved")
