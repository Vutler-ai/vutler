"use client";

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authFetch } from '@/lib/authFetch';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

export default function IntegrationCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'connecting' | 'success' | 'error'>('connecting');
  const [message, setMessage] = useState<string>('');
  const [providerName, setProviderName] = useState<string>('');

  useEffect(() => {
    handleCallback();
  }, [searchParams]);

  const handleCallback = async () => {
    try {
      const code = searchParams?.get('code');
      const state = searchParams?.get('state');
      const provider = searchParams?.get('provider') || state; // Sometimes provider is in state
      const error = searchParams?.get('error');

      if (error) {
        setStatus('error');
        setMessage(`OAuth error: ${error}`);
        return;
      }

      if (!code || !provider) {
        setStatus('error');
        setMessage('Missing required parameters (code or provider)');
        return;
      }

      setProviderName(provider.charAt(0).toUpperCase() + provider.slice(1));

      // Call the backend callback endpoint
      const response = await authFetch(`/api/v1/integrations/${provider}/callback?${searchParams?.toString()}`, {
        method: 'GET'
      });

      const result = await response.json();

      if (response.ok) {
        setStatus('success');
        setMessage(`Successfully connected to ${providerName}!`);
        
        // Redirect to integrations page after a delay
        setTimeout(() => {
          router.push('/integrations');
        }, 2000);
      } else {
        setStatus('error');
        setMessage(result.error || `Failed to connect to ${providerName}`);
      }

    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'connecting':
        return (
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500"></div>
        );
      case 'success':
        return <CheckCircleIcon className="w-16 h-16 text-green-500" />;
      case 'error':
        return <XCircleIcon className="w-16 h-16 text-red-500" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'connecting':
        return 'text-blue-400';
      case 'success':
        return 'text-green-400';
      case 'error':
        return 'text-red-400';
    }
  };

  const getStatusTitle = () => {
    switch (status) {
      case 'connecting':
        return 'Connecting...';
      case 'success':
        return 'Connection Successful!';
      case 'error':
        return 'Connection Failed';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0e0f1a] p-4">
      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-8 max-w-md w-full text-center">
        <div className="mb-6 flex justify-center">
          {getStatusIcon()}
        </div>
        
        <h1 className={`text-2xl font-bold mb-4 ${getStatusColor()}`}>
          {getStatusTitle()}
        </h1>
        
        <p className="text-[#9ca3af] mb-6">
          {message || 'Please wait while we establish the connection...'}
        </p>
        
        {status === 'connecting' && (
          <div className="space-y-2">
            <div className="animate-pulse flex space-x-1 justify-center">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animation-delay-200"></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animation-delay-400"></div>
            </div>
            <p className="text-xs text-[#6b7280]">
              This may take a few moments...
            </p>
          </div>
        )}
        
        {status === 'success' && (
          <div className="space-y-4">
            <p className="text-sm text-[#6b7280]">
              Redirecting you back to the integrations page...
            </p>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div className="bg-green-500 h-2 rounded-full w-full animate-pulse"></div>
            </div>
          </div>
        )}
        
        {status === 'error' && (
          <div className="space-y-4">
            <button
              onClick={() => router.push('/integrations')}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Back to Integrations
            </button>
            <button
              onClick={handleCallback}
              className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
