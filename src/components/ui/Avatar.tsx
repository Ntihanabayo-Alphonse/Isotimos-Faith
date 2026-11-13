import { useState } from 'react'

const colors = ['#dbe8ff', '#ffe9ce', '#e3e6d8', '#eee3f9']
export function Avatar({ name, color = 0, small = false, src }: { name: string; color?: number; small?: boolean; src?: string | null }) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const initials = name.split(' ').slice(0, 2).map(part => part[0]).join('')
  if (src?.startsWith('https://') && failedSource !== src) return <img className={`avatar ${small ? 'avatar-small' : ''}`} src={src} alt={name} referrerPolicy="no-referrer" onError={() => setFailedSource(src)} />
  return <span className={`avatar ${small ? 'avatar-small' : ''}`} style={{ background: colors[color % colors.length] }} aria-label={name}>{initials}</span>
}
