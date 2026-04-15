// src/components/layout/PageHeader.jsx
// Reusable Legora-style page header — eyebrow + serif title + optional stats + optional toolbar.
// Drop into any page to get the design-system-correct heading block.
//
// Usage:
//   <PageHeader
//     eyebrowCategory="REVENUE"
//     eyebrowSuffix="Pipeline"
//     title="Pipeline"
//     stats={[
//       { value: '247', label: 'Total' },
//       { value: '14%', label: 'Reply rate' },
//     ]}
//     toolbar={<button className="ltn-cta">+ New deal</button>}
//   />

export default function PageHeader({ eyebrowCategory, eyebrowSuffix, title, subtitle, stats, toolbar }) {
  return (
    <div className="lg-page-head">
      <div className="lg-page-head-row">
        <div>
          {(eyebrowCategory || eyebrowSuffix) && (
            <div className="lg-eyebrow">
              {eyebrowCategory && <span className="lg-eyebrow-cat">{eyebrowCategory}</span>}
              {eyebrowCategory && eyebrowSuffix && <span className="lg-eyebrow-sep">/</span>}
              {eyebrowSuffix && <span>{eyebrowSuffix}</span>}
            </div>
          )}
          <h1 className="lg-page-title">{title}</h1>
          {subtitle && <p className="lg-page-sub">{subtitle}</p>}
        </div>
        {(stats || toolbar) && (
          <div className="lg-head-right">
            {stats && (
              <div className="lg-stats">
                {stats.map((s, i) => (
                  <div className="lg-stat" key={i}>
                    <div className="lg-stat-val">{s.value}</div>
                    <div className="lg-stat-lbl">{s.label}</div>
                  </div>
                ))}
              </div>
            )}
            {toolbar && <div className="lg-toolbar">{toolbar}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
