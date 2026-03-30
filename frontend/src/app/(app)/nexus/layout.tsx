import { ReactNode } from 'react';


interface NexusLayoutProps {
  children: ReactNode;
}

export default function NexusLayout({ children }: NexusLayoutProps) {
  return (
    <div className="min-h-screen bg-[#0a0b14]">
      <main className="py-8">
        {children}
      </main>
    </div>
  );
}
