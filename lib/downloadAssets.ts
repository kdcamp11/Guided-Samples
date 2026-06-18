import JSZip from 'jszip'

/** Trigger a browser download for a single data URL. */
export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Convert a data URL to a Blob (for zipping). */
function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',')
  const mime = head.match(/:(.*?);/)?.[1] ?? 'image/png'
  const bin = atob(body)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

/** Package a set of named PNG data URLs into a single .zip download. */
export async function downloadAssetsZip(
  assets: { name: string; dataUrl: string }[],
  zipName: string,
) {
  const zip = new JSZip()
  assets.forEach(({ name, dataUrl }) => {
    if (dataUrl) zip.file(name, dataUrlToBlob(dataUrl))
  })
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  downloadDataUrl(url, zipName)
  URL.revokeObjectURL(url)
}
