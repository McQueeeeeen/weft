const cache = new Map<string, HTMLImageElement>()
const listeners = new Set<() => void>()

function request(src: string): HTMLImageElement {
  let img = cache.get(src)
  if (!img) {
    img = new Image()
    img.decoding = 'async'
    img.addEventListener('load', () => listeners.forEach((l) => l()))
    img.src = src
    cache.set(src, img)
  }
  return img
}

export function loadedImage(src: string): HTMLImageElement | null {
  const img = request(src)
  return img.complete && img.naturalWidth > 0 ? img : null
}

export function onImageLoad(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function preloadImages(srcs: readonly string[]): Promise<unknown> {
  return Promise.all(
    srcs.map((src) => {
      const img = request(src)
      if (img.complete) return Promise.resolve()
      return new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true })
        img.addEventListener('error', resolve, { once: true })
      })
    }),
  )
}
