import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App.tsx'
import { resolveBoardId } from './app/routing.ts'
import { loadIdentity } from './collab/identity.ts'
import { Session } from './collab/session.ts'
import './styles.css'

const session = new Session(resolveBoardId(), loadIdentity())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App session={session} />
  </StrictMode>,
)
