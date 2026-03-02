'use client';

import { useState, useEffect } from 'react';
import { Trash2, AlertCircle, Plus } from 'lucide-react';

export default function TokensPage() {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revoking, setRevoking] = useState(null);

  const fetchTokens = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/v1/nexus/tokens');
      if (!response.ok) throw new Error('Failed to load tokens');
      
      const data = await response.json();
      setTokens(data.tokens || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokens();
  }, []);

  const revokeToken = async (id) => {
    if (!confirm('Are you sure? This token will no longer work.')) return;
    
    setRevoking(id);
    try {
      const response = await fetch(`/api/v1/nexus/tokens/${id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to revoke token');
      
      setTokens(tokens.filter(t => t.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">🔑 API Tokens</h1>
          <p className="text-gray-600">Manage your Nexus API tokens</p>
        </div>
        <a
          href="/nexus/setup"
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition flex items-center gap-2"
        >
          <Plus size={18} />
          Generate Token
        </a>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-6 flex items-start gap-2">
          <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-600">Loading tokens...</p>
        </div>
      ) : tokens.length === 0 ? (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
          <div className="text-4xl mb-4">🔐</div>
          <h3 className="text-lg font-semibold mb-2">No tokens yet</h3>
          <p className="text-gray-600 mb-4">Create your first token to get started with vutler-nexus</p>
          <a
            href="/nexus/setup"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition"
          >
            Generate First Token →
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {tokens.map((token) => (
            <div
              key={token.id}
              className={`bg-white border rounded-lg p-6 flex items-center justify-between hover:shadow-md transition ${
                token.revoked ? 'opacity-50 border-red-200' : 'border-gray-200'
              }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-semibold">{token.name}</h3>
                  {token.revoked && (
                    <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded">
                      Revoked
                    </span>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                  <div>
                    <span className="font-medium">Token:</span>
                    <p className="font-mono text-xs break-all">{token.token}</p>
                  </div>
                  <div>
                    <span className="font-medium">Created:</span>
                    <p>{new Date(token.created_at).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <span className="font-medium">Last Used:</span>
                    <p>{token.last_used_at ? new Date(token.last_used_at).toLocaleDateString() : 'Never'}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => revokeToken(token.id)}
                disabled={token.revoked || revoking === token.id}
                className="ml-4 bg-red-600 text-white p-2 rounded-md hover:bg-red-700 disabled:bg-gray-400 transition"
                title="Revoke token"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-900">
          <strong>⚠️ Security:</strong> Revoked tokens cannot be reactivated. Generate a new token if you need to register a new instance.
        </p>
      </div>
    </div>
  );
}
