import '@fontsource-variable/onest'
import { IconContext } from '@phosphor-icons/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App.tsx'
import { boardIdFromPath } from './app/routing.ts'
import { loadIdentity } from './collab/identity.ts'
import { Session } from './collab/session.ts'
import { Landing } from './landing/Landing.tsx'
import './styles.css'

const boardId = boardIdFromPath()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IconContext.Provider value={{ size: 20, weight: 'regular' }}>
      {boardId ? <App session={new Session(boardId, loadIdentity())} /> : <Landing />}
    </IconContext.Provider>
  </StrictMode>,
)
