import type { Editor, Vec } from '@weft/core'

const MAX_SIDE = 480
const OFFSET = 24

async function upload(file: File): Promise<{ src: string; w: number; h: number }> {
  const res = await fetch('/api/assets', {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!res.ok) throw new Error((await res.text()) || 'The image could not be uploaded.')
  const { url } = (await res.json()) as { url: string }
  const bitmap = await createImageBitmap(file)
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const size = { w: Math.round(bitmap.width * k), h: Math.round(bitmap.height * k) }
  bitmap.close()
  return { src: url, ...size }
}

export const imageFiles = (list: FileList | null | undefined): File[] =>
  [...(list ?? [])].filter((f) => f.type.startsWith('image/'))

export async function insertImages(
  editor: Editor,
  files: readonly File[],
  at?: Vec,
): Promise<void> {
  const { width, height } = editor.viewport
  const center = editor.screenToWorld(at ?? { x: width / 2, y: height / 2 })
  const uploaded = await Promise.all(files.map(upload))
  editor.history.stopCapturing()
  const ids = editor.board.transact(() =>
    uploaded.map(({ src, w, h }, i) =>
      editor.board.create({
        type: 'image',
        x: center.x - w / 2 + i * OFFSET,
        y: center.y - h / 2 + i * OFFSET,
        w,
        h,
        src,
        color: 'ink',
      }),
    ),
  )
  editor.history.stopCapturing()
  editor.setTool('select')
  editor.select(ids)
}
