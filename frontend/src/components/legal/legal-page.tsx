import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

interface LegalSection {
  title: string;
  paragraphs?: React.ReactNode[];
  bullets?: React.ReactNode[];
  note?: React.ReactNode;
}

interface LegalMetaItem {
  label: string;
  value: string;
}

interface RelatedLink {
  href: string;
  label: string;
}

interface LegalPageProps {
  eyebrow: string;
  title: string;
  summary: React.ReactNode;
  meta: LegalMetaItem[];
  sections: LegalSection[];
  relatedLinks: RelatedLink[];
  children?: React.ReactNode;
}

export function LegalPage({
  eyebrow,
  title,
  summary,
  meta,
  sections,
  relatedLinks,
  children,
}: LegalPageProps) {
  return (
    <div className="min-h-screen bg-[#08090f] pt-24 pb-24 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-3xl">
          <Badge className="mb-4 border border-blue-500/30 bg-blue-600/15 text-blue-300">
            {eyebrow}
          </Badge>
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
          <p className="max-w-2xl text-lg leading-8 text-white/60">{summary}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            {meta.map((item) => (
              <div
                key={`${item.label}-${item.value}`}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60"
              >
                <span className="text-white/35">{item.label}:</span> {item.value}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
          <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8 lg:p-10">
            <div className="space-y-10">
              {sections.map((section) => (
                <section key={section.title} className="space-y-4">
                  <h2 className="text-2xl font-semibold tracking-tight">{section.title}</h2>
                  {section.paragraphs?.map((paragraph, index) => (
                    <p key={index} className="leading-7 text-white/70">
                      {paragraph}
                    </p>
                  ))}
                  {section.bullets?.length ? (
                    <ul className="space-y-3 pl-5 text-white/70">
                      {section.bullets.map((bullet, index) => (
                        <li key={index} className="list-disc leading-7">
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {section.note ? (
                    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm leading-6 text-blue-100/90">
                      {section.note}
                    </div>
                  ) : null}
                </section>
              ))}

              {children ? (
                <section className="rounded-2xl border border-white/10 bg-[#0f1220] p-5">
                  {children}
                </section>
              ) : null}
            </div>
          </article>

          <aside className="h-fit rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-white/40">
              Related
            </h2>
            <nav aria-label="Legal pages" className="space-y-2">
              {relatedLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-2xl border border-white/8 px-4 py-3 text-sm text-white/60 transition-colors hover:border-white/15 hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </aside>
        </div>
      </div>
    </div>
  );
}
