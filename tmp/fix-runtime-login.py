c = open("/home/ubuntu/vutler/app/custom/services/agentRuntime.js").read()

old = "params: [{ resume: RC_ADMIN_TOKEN }]"
new = 'params: [{user: {username: process.env.RC_ADMIN_USERNAME || "alopez3006"}, password: process.env.RC_ADMIN_PASSWORD || ""}]'

if old in c:
    c = c.replace(old, new)
    print("Fixed login method")
else:
    print("Pattern not found, searching...")
    idx = c.find("resume")
    if idx > 0:
        print(f"Found 'resume' at {idx}: ...{c[idx-20:idx+60]}...")

open("/home/ubuntu/vutler/app/custom/services/agentRuntime.js", "w").write(c)
print("Saved")
