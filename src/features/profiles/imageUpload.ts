import { supabase } from '../../lib/supabase'

export type ImageKind = 'avatar' | 'cover'
export const IMAGE_LIMITS = { avatar: 2 * 1024 * 1024, cover: 5 * 1024 * 1024 }

export async function validateImageFile(file: File, kind: ImageKind) {
  if (!file.size || file.size > IMAGE_LIMITS[kind]) throw new Error(`${kind === 'avatar' ? 'Avatar' : 'Cover'} images must be ${kind === 'avatar' ? '2' : '5'} MB or smaller.`)
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image. SVG and GIF files are not supported.')
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  if (!(file.type === 'image/png' ? png : file.type === 'image/jpeg' ? jpeg : webp)) throw new Error('The file contents do not match its image type.')
}

export async function prepareImage(file: File, kind: ImageKind): Promise<Blob> {
  await validateImageFile(file, kind)
  let image: ImageBitmap
  try { image = await createImageBitmap(file) }
  catch { throw new Error('This image could not be opened. Choose a valid JPEG, PNG, or WebP image.') }
  try {
    if (!image.width || !image.height || image.width > 8192 || image.height > 8192 || image.width * image.height > 32_000_000) throw new Error('Choose an image no larger than 8192 pixels per side and 32 megapixels.')
    const maxWidth = kind === 'avatar' ? 1024 : 2400
    const scale = Math.min(1, maxWidth / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image processing is unavailable in this browser.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', .85))
    if (!blob || blob.type !== 'image/webp' || blob.size > IMAGE_LIMITS[kind]) throw new Error('The image could not be prepared within the upload limit. Try a smaller file.')
    return blob
  } finally { image.close() }
}

export async function uploadProfileImage(userId: string, file: File, kind: ImageKind): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured')
  const image = await prepareImage(file, kind)
  const bucket = kind === 'avatar' ? 'member-avatars' : 'member-covers'
  const path = `${userId}/${crypto.randomUUID()}.webp`
  const storage = supabase.storage.from(bucket)
  const { error } = await storage.upload(path, image, { contentType: 'image/webp', upsert: false, cacheControl: '3600' })
  if (error) throw new Error('Upload failed. Check your connection and ask the administrator to verify the member image buckets and migration 005.')
  return storage.getPublicUrl(path).data.publicUrl
}
