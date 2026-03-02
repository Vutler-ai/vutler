'use client';

import { useState } from 'react';
import { Copy, Check, AlertCircle } from 'lucide-react';

// Helper: Get JWT from localStorage and add to headers
function getAuthHeaders(additionalHeaders = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') || localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...additionalHeaders
  };
}

export default function NexusSetupPage() {
  const [token, setToken] = useState(null);
  const [tokenName, setTokenName] = useState('My Nexus Token');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState(1); // 1: Generate, 2: Copy, 3: Register

  const generateToken = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/v1/nexus/cli/tokens', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name: tokenName })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate token');
      }

      const data = await response.json();
      setToken(data.token);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        <h1 className="text-3xl font-bold mb-2">🚀 Nexus Setup</h1>
        <p className="text-gray-600 mb-8">Generate an API token to use with vutler-nexus CLI</p>

        {/* Step 1: Generate Token */}
        <div className="space-y-6">
          <div className={`border-l-4 p-4 rounded ${step >= 1 ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
            <h2 className="font-semibold mb-4">Step 1: Generate Token</h2>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-2">Token Name</label>
                <input
                  type="text"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="e.g., My Nexus Token"
                  disabled={token !== null}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100"
                />
              </div>

              <button
                onClick={generateToken}
                disabled={loading || token !== null}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition"
              >
                {loading ? 'Generating...' : 'Generate Token'}
              </button>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md flex items-start gap-2">
                  <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Copy Token */}
          {token && (
            <div className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded">
              <h2 className="font-semibold mb-4">Step 2: Copy Token</h2>
              
              <div className="bg-gray-900 text-green-400 font-mono p-4 rounded-md mb-4 relative">
                <div className="break-all text-sm">{token}</div>
                <button
                  onClick={copyToClipboard}
                  className="absolute top-2 right-2 bg-gray-800 hover:bg-gray-700 p-2 rounded transition"
                  title="Copy to clipboard"
                >
                  {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
                </button>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-md mb-4">
                <p className="text-sm"><strong>⚠️ Important:</strong> Copy this token now. You won't see it again!</p>
              </div>

              <button
                onClick={() => setStep(3)}
                className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition"
              >
                I've Copied the Token →
              </button>
            </div>
          )}

          {/* Step 3: Instructions */}
          {step === 3 && (
            <div className="border-l-4 border-green-500 bg-green-50 p-4 rounded">
              <h2 className="font-semibold mb-4">Step 3: Use Token with Nexus CLI</h2>
              
              <div className="space-y-4 text-sm">
                <div>
                  <p className="font-medium mb-2">Install vutler-nexus globally:</p>
                  <pre className="bg-gray-900 text-green-400 p-3 rounded overflow-x-auto text-xs">
                    npm install -g vutler-nexus
                  </pre>
                </div>

                <div>
                  <p className="font-medium mb-2">Run the interactive setup:</p>
                  <pre className="bg-gray-900 text-green-400 p-3 rounded overflow-x-auto text-xs">
                    vutler-nexus init
                  </pre>
                </div>

                <div>
                  <p className="font-medium mb-2">When prompted for execution mode, select: <code className="bg-gray-200 px-2 py-1 rounded">Cloud (Vutler API)</code></p>
                  <p className="font-medium mb-2">When prompted for API token, paste the token you just copied</p>
                </div>

                <div>
                  <p className="font-medium mb-2">Start the Nexus runtime:</p>
                  <pre className="bg-gray-900 text-green-400 p-3 rounded overflow-x-auto text-xs">
                    vutler-nexus start
                  </pre>
                </div>

                <div className="bg-blue-100 border border-blue-400 text-blue-900 p-3 rounded">
                  <p className="text-xs"><strong>💡 Tip:</strong> Your instance will appear in the <a href="/nexus/dashboard" className="underline font-medium">Nexus Dashboard</a> within seconds</p>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => {
                    setToken(null);
                    setStep(1);
                    setError(null);
                  }}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 transition"
                >
                  Generate Another Token
                </button>
                <a
                  href="/nexus/dashboard"
                  className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition text-center"
                >
                  Go to Dashboard →
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
