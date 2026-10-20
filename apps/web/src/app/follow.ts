import { cameraToFit, viewportBox, type Camera, type Editor, type Presence } from '@weft/core'
import { useEffect, useState } from 'react'

export function useFollow(editor: Editor, presence: Presence) {
  const [following, setFollowing] = useState<number | null>(null)

  useEffect(() => {
    let camera: Camera | null = null
    let viewport = editor.viewport
    return editor.subscribe(() => {
      if (editor.camera === camera && editor.viewport === viewport) return
      camera = editor.camera
      viewport = editor.viewport
      if (viewport.width > 0) {
        presence.setView(viewportBox(camera, viewport.width, viewport.height))
      }
    })
  }, [editor, presence])

  useEffect(() => {
    if (following === null) return
    let applied: Camera | null = null
    let seen = ''
    const follow = () => {
      const peer = presence.peers().find((p) => p.clientId === following)
      if (!peer) return setFollowing(null)
      const key = JSON.stringify(peer.view)
      if (!peer.view || key === seen) return
      seen = key
      const { width, height } = editor.viewport
      applied = cameraToFit(peer.view, width, height, 0, 8)
      editor.setCamera(applied)
    }
    follow()
    const offPresence = presence.subscribe(follow)
    const offEditor = editor.subscribe(() => {
      if (applied && editor.camera !== applied) setFollowing(null)
    })
    return () => {
      offPresence()
      offEditor()
    }
  }, [editor, presence, following])

  return [following, setFollowing] as const
}
