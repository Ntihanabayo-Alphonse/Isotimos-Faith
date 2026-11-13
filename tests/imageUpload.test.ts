// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IMAGE_LIMITS, prepareImage, uploadProfileImage, validateImageFile } from '../src/features/profiles/imageUpload'

const storage = vi.hoisted(() => ({ from: vi.fn(), upload: vi.fn(), getPublicUrl: vi.fn() }))
vi.mock('../src/lib/supabase', () => ({ supabase: { storage: { from: storage.from } } }))
const pngHeader = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
const png = () => new File([pngHeader], 'my-photo.png', { type: 'image/png' })
const bitmap = { width: 1800, height: 1200, close: vi.fn() }
const drawImage = vi.fn()
const toBlob = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage }), toBlob }) })
  toBlob.mockImplementation(callback => callback(new Blob(['processed image'], { type: 'image/webp' })))
  storage.from.mockReturnValue({ upload: storage.upload, getPublicUrl: storage.getPublicUrl })
  storage.upload.mockResolvedValue({ error: null })
  storage.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://project.example/storage/v1/object/public/member-avatars/alice/photo.webp' } })
})
afterEach(() => vi.unstubAllGlobals())

describe('profile image validation, processing, and Storage upload', () => {
  it('rejects empty, oversized, and unsupported files before upload', async () => {
    await expect(validateImageFile(new File([], 'empty.png', { type: 'image/png' }), 'avatar')).rejects.toThrow('2 MB')
    await expect(validateImageFile(new File([new Uint8Array(IMAGE_LIMITS.avatar + 1)], 'large.png', { type: 'image/png' }), 'avatar')).rejects.toThrow('2 MB')
    await expect(validateImageFile(new File([new Uint8Array(IMAGE_LIMITS.cover + 1)], 'large.png', { type: 'image/png' }), 'cover')).rejects.toThrow('5 MB')
    for (const type of ['image/svg+xml', 'image/gif', 'text/html']) {
      await expect(validateImageFile(new File(['payload'], 'payload', { type }), 'avatar')).rejects.toThrow('JPEG, PNG, or WebP')
    }
    expect(storage.upload).not.toHaveBeenCalled()
  })
  it('checks actual magic bytes instead of trusting the name or MIME alone', async () => {
    await expect(validateImageFile(new File(['not an image'], 'fake.png', { type: 'image/png' }), 'avatar')).rejects.toThrow('contents do not match')
    await expect(validateImageFile(png(), 'avatar')).resolves.toBeUndefined()
  })
  it('decodes and re-encodes images as WebP before uploading', async () => {
    const output = await prepareImage(png(), 'avatar')
    expect(output.type).toBe('image/webp')
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1024, 683)
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', .85)
    expect(bitmap.close).toHaveBeenCalled()
  })
  it('rejects decode failures and excessive decoded dimensions', async () => {
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('decode failed'))
    await expect(prepareImage(png(), 'avatar')).rejects.toThrow('could not be opened')
    const giant = { width: 8192, height: 8192, close: vi.fn() }
    vi.mocked(createImageBitmap).mockResolvedValueOnce(giant as unknown as ImageBitmap)
    await expect(prepareImage(png(), 'cover')).rejects.toThrow('32 megapixels')
    expect(giant.close).toHaveBeenCalled()
    expect(storage.upload).not.toHaveBeenCalled()
  })
  it('refuses failed encoding and oversized encoded output', async () => {
    toBlob.mockImplementationOnce(callback => callback(null))
    await expect(prepareImage(png(), 'avatar')).rejects.toThrow('could not be prepared')
    toBlob.mockImplementationOnce(callback => callback(new Blob([new Uint8Array(IMAGE_LIMITS.avatar + 1)], { type: 'image/webp' })))
    await expect(prepareImage(png(), 'avatar')).rejects.toThrow('could not be prepared')
  })
  it('uploads under the caller folder with a unique name, WebP MIME, and no overwrites', async () => {
    expect(await uploadProfileImage('alice', png(), 'avatar')).toMatch(/^https:/)
    expect(storage.from).toHaveBeenCalledWith('member-avatars')
    expect(storage.upload).toHaveBeenCalledWith(expect.stringMatching(/^alice\/[0-9a-f-]{36}\.webp$/), expect.any(Blob), { contentType: 'image/webp', upsert: false, cacheControl: '3600' })
    await uploadProfileImage('alice', png(), 'cover')
    expect(storage.from).toHaveBeenLastCalledWith('member-covers')
    expect(storage.upload.mock.calls[0][0]).not.toBe(storage.upload.mock.calls[1][0])
  })
  it('reports Storage failures without claiming a successful upload', async () => {
    storage.upload.mockResolvedValue({ error: { statusCode: 403 } })
    await expect(uploadProfileImage('alice', png(), 'avatar')).rejects.toThrow('Upload failed')
    expect(storage.getPublicUrl).not.toHaveBeenCalled()
  })
})
