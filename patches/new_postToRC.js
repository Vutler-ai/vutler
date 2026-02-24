  async _postToRC(channelId, agentId, text) {
    const credentials = this.agentCredentials.get(agentId) || {
      authToken: this.rcAuthToken || RC_ADMIN_TOKEN,
      userId: this.rcUserId || RC_ADMIN_USER_ID
    };

    const res = await fetch(`${RC_API_URL}/api/v1/chat.postMessage`, {
      method : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': credentials.authToken,
        'X-User-Id'   : credentials.userId,
      },
      body: JSON.stringify({ roomId: channelId, text }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`RC postMessage failed (${res.status}): ${body}`);
    }
    return (await res.json()).message?._id;
  }