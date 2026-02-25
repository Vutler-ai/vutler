c = open("/home/ubuntu/vutler/app/custom/admin/agent-detail.html").read()

# Fix: don't call recall with empty query
old = "`/api/v1/agents/${agentId}/recall?query=`;"
new = "null;"
c = c.replace(old, new)
print("Replaced empty query URL with null")

# Add null guard in loadMemories
old2 = "async function loadMemories(query) {"
new2 = """async function loadMemories(query) {
  if (!query) {
    var mg = document.getElementById('memoryGrid');
    if (mg) mg.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:20px;">Search memories or add new ones.</p>';
    return;
  }"""
c = c.replace(old2, new2, 1)
print("Added null guard")

open("/home/ubuntu/vutler/app/custom/admin/agent-detail.html", "w").write(c)
print("Saved")
