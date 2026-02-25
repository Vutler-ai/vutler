#!/bin/bash
set -e
FILE="/home/ubuntu/vutler/app/custom/services/agentRuntime.js"

# Backup
cp "$FILE" "$FILE.bak-s13"

# 1. Patch _recallMemories to filter by agent_id
sed -i "s|async _recallMemories(agentId, query) {|async _recallMemories(agentId, query) {\n    // S13: agent-scoped memory recall|" "$FILE"

sed -i "s|const result = await this._callSnipara('rlm_recall', { query, limit: 5 });|const result = await this._callSnipara('rlm_recall', { query, limit: 5, tags: [\`agentId:\${agentId}\`] });|" "$FILE"

# 2. Patch _storeMemory to use agent-scoped tags (not shared)
sed -i "s|await this._callSnipara('rlm_remember', { content, type, tags: \[\`agentId:\${agentId}\`, 'shared'\] });|await this._callSnipara('rlm_remember', { content, type, tags: [\`agentId:\${agentId}\`], metadata: { agent_id: agentId } });|" "$FILE"

# 3. Add post-reply learning storage after the existing user preference storage block
# Find the line "this._storeMemory(agentId, `User: ${message.msg}`, 'preference').catch(() => {});"
# and add agent reply learning after the closing brace of that if block
sed -i '/this._storeMemory(agentId, `User: \${message.msg}`, '\''preference'\'').catch(() => {});/a\
      }\
\
      // S13: Store agent reply as learning (if substantive)\
      if (reply && reply.length > 80) {\
        this._storeMemory(agentId, `[${meta.name} replied]: ${reply.slice(0, 500)}`, '\''learning'\'').catch(() => {});' "$FILE"

echo "Runtime patched for S13"
