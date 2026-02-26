'use client';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ backgroundColor: '#08090f', color: 'white', padding: '2rem', minHeight: '100vh', fontFamily: 'system-ui' }}>
      <h2 style={{ color: '#f87171' }}>Page Error</h2>
      <pre style={{ color: '#fbbf24', whiteSpace: 'pre-wrap', maxWidth: '90vw', overflow: 'auto', fontSize: '0.875rem' }}>
        {error.message}
        {'\n\n'}
        {error.stack}
      </pre>
      <button
        onClick={() => reset()}
        style={{ marginTop: '1rem', padding: '0.5rem 1rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
      >
        Try again
      </button>
    </div>
  );
}
