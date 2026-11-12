import { CodeXml } from 'lucide-react'

export default function Brand({ compact = false }) {
  return (
    <span className={`brand${compact ? ' brand-compact' : ''}`}>
      <span className="brand-mark">
        <CodeXml size={23} strokeWidth={2.3} />
      </span>
      <span>
        CodeCrew<span className="brand-dot" aria-hidden="true">.</span>
      </span>
    </span>
  )
}
