import '@fontsource-variable/onest'
import { IconContext } from '@phosphor-icons/react'
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
    <IconContext.Provider value={{ size: 20, weight: 'regular' }}>
      <App session={session} />
    </IconContext.Provider>
  </StrictMode>,
)
