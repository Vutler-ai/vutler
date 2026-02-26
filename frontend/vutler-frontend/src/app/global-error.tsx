'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ backgroundColor: '#08090f', color: 'white', padding: '2rem', fontFamily: 'system-ui' }}>
        <h2>Something went wrong!</h2>
        <pre style={{ color: '#f87171', whiteSpace: 'pre-wrap', maxWidth: '90vw', overflow: 'auto' }}>
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
      </body>
    </html>
  );
}
