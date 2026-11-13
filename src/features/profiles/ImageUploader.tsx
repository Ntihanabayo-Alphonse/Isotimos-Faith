import { useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { uploadProfileImage } from './imageUpload'
import type { ImageKind } from './imageUpload'

export function ImageUploader({ userId, kind, value, disabled, onChange, onBusy }: {
  userId: string; kind: ImageKind; value: string; disabled: boolean
  onChange: (url: string) => void; onBusy: (busy: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const label = kind === 'avatar' ? 'Profile image' : 'Cover image'
  return <div className="image-uploader">
    <div className="upload-heading"><ImagePlus size={18} /><strong>{label}</strong></div>
    <p>JPEG, PNG, or WebP · {kind === 'avatar' ? '2' : '5'} MB maximum. Images are public.</p>
    {value && <div className={`upload-preview ${kind}`}><img src={value} alt={`${label} preview`} referrerPolicy="no-referrer" /></div>}
    <label className="upload-file-label">{busy ? 'Preparing and uploading…' : `Choose ${kind} image`}<input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Upload ${kind} image`} disabled={disabled || busy} onChange={async event => {
      const file = event.target.files?.[0]
      if (!file) return
      setBusy(true); onBusy(true); setError(''); setNotice('')
      try { const url = await uploadProfileImage(userId, file, kind); onChange(url); setNotice('Image uploaded. Save your profile to use it.') }
      catch (error) { setError(error instanceof Error ? error.message : 'The image could not be uploaded. Please try again.') }
      finally { setBusy(false); onBusy(false); if (input.current) input.current.value = '' }
    }} /></label>
    {value && <button type="button" className="upload-remove" disabled={disabled || busy} onClick={() => { onChange(''); setNotice('Image removed from this draft. Save your profile to confirm.') }}>Clear image</button>}
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
  </div>
}
