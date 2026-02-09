import Link from 'next/link'

const sections = [
  { id: 'quick-start', label: 'Quick Start' },
  { id: 'workspaces', label: 'Workspaces' },
  { id: 'boxes', label: 'Boxes' },
  { id: 'items', label: 'Items' },
  { id: 'mobile-gestures', label: 'Mobile Gestures' },
  { id: 'search', label: 'Search' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
] as const

export default function DashboardHelpPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">PackSketcher Help</h1>
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              Back to Dashboard
            </Link>
          </div>

          {/* Reserved for a future video tutorial link. */}

          <nav aria-label="Help sections" className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <ul className="flex flex-wrap gap-2 text-xs sm:text-sm">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="inline-block rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 hover:bg-slate-100"
                  >
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-6 space-y-6 text-sm text-slate-700">
            <section id="quick-start">
              <h2 className="text-base font-semibold text-slate-900">Quick Start</h2>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Open Dashboard.</li>
                <li>Create a workspace from template or custom background upload.</li>
                <li>Open the workspace card.</li>
                <li>Switch to Edit mode.</li>
                <li>Add, move, and resize boxes.</li>
                <li>Open box details and save your changes.</li>
              </ol>
            </section>

            <section id="workspaces">
              <h2 className="text-base font-semibold text-slate-900">Workspaces</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Create from template</li>
                <li>Upload custom background</li>
                <li>Rename or delete workspace</li>
              </ul>
            </section>

            <section id="boxes">
              <h2 className="text-base font-semibold text-slate-900">Boxes</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Add box in Edit mode</li>
                <li>Move and resize selected box</li>
                <li>Reorder and delete with confirmation</li>
              </ul>
            </section>

            <section id="items">
              <h2 className="text-base font-semibold text-slate-900">Items</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Add, edit, or remove items in box details</li>
                <li>Bulk move items between boxes and workspaces</li>
              </ul>
            </section>

            <section id="mobile-gestures">
              <h2 className="text-base font-semibold text-slate-900">Mobile Gestures</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Two fingers for pan/zoom</li>
                <li>One finger for selected box interaction in Edit mode</li>
                <li>Double-tap selected box to open details</li>
              </ul>
            </section>

            <section id="search">
              <h2 className="text-base font-semibold text-slate-900">Search</h2>
              <p className="mt-2">Use Global Item Search to find items and jump directly to their workspace and box.</p>
            </section>

            <section id="troubleshooting">
              <h2 className="text-base font-semibold text-slate-900">Troubleshooting</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>If editing is blocked, make sure Edit mode is enabled.</li>
                <li>If search returns nothing, type at least 3 characters.</li>
                <li>If save fails, check the inline error message and retry.</li>
              </ul>
            </section>

            <p className="mt-8 pt-6 border-t border-slate-200 text-slate-600">
              Contact: <a href="mailto:packsketcher@gmail.com" className="text-slate-900 underline hover:text-slate-700">packsketcher@gmail.com</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
