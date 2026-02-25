import hashlib

c = open("/home/ubuntu/vutler/app/custom/services/agentRuntime.js").read()

# Meteor DDP login format requires SHA-256 hashed password
# Format: {user: {username: "x"}, password: {digest: "sha256hex", algorithm: "sha-256"}}
old = 'params: [{user: {username: process.env.RC_ADMIN_USERNAME || "alopez3006"}, password: process.env.RC_ADMIN_PASSWORD || ""}]'

new = """params: [(function(){
          var crypto = require('crypto');
          var pwd = process.env.RC_ADMIN_PASSWORD || '';
          var digest = crypto.createHash('sha256').update(pwd).digest('hex');
          return {user: {username: process.env.RC_ADMIN_USERNAME || 'alopez3006'}, password: {digest: digest, algorithm: 'sha-256'}};
        })()]"""

if old in c:
    c = c.replace(old, new)
    print("Fixed with SHA-256 digest format")
else:
    print("Old pattern not found")
    idx = c.find("RC_ADMIN_USERNAME")
    if idx > 0:
        print(f"Found at {idx}: ...{c[idx-30:idx+100]}...")
    else:
        print("RC_ADMIN_USERNAME not found at all")

open("/home/ubuntu/vutler/app/custom/services/agentRuntime.js", "w").write(c)
print("Saved")
