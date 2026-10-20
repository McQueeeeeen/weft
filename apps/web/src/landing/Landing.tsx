import {
  ArrowCounterClockwiseIcon,
  GithubLogoIcon,
  LightningIcon,
  WifiSlashIcon,
} from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { newBoardUrl } from '../app/routing.ts'
import { useTheme } from '../app/theme.ts'

const SOURCE_URL = 'https://github.com/McQueeeeeen/weft'

function Shot({ alt }: { alt: string }) {
  return (
    <>
      <img
        className="shot shot-light"
        src="/shots/board-light.png"
        alt={alt}
        width={2880}
        height={1800}
        loading="eager"
      />
      <img
        className="shot shot-dark"
        src="/shots/board-dark.png"
        alt={alt}
        width={2880}
        height={1800}
        loading="eager"
      />
    </>
  )
}

function Fact({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="fact">
      <span className="fact-icon" aria-hidden="true">
        {icon}
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </li>
  )
}

export function Landing() {
  useTheme()
  const boardUrl = newBoardUrl()

  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="wordmark">weft</span>
        <nav aria-label="Primary">
          <a className="nav-link" href={SOURCE_URL}>
            <GithubLogoIcon />
            View source
          </a>
          <a className="primary" href={boardUrl}>
            Open a board
          </a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1>Draw together, in real time</h1>
            <p>
              Weft is a multiplayer whiteboard. Cursors, sticky notes and arrows sync instantly, and
              boards keep working offline.
            </p>
            <div className="hero-actions">
              <a className="primary" href={boardUrl}>
                Open a board
              </a>
              <a className="secondary" href={SOURCE_URL}>
                View source
              </a>
            </div>
          </div>
          <figure className="hero-shot">
            <Shot alt="A board with sticky notes joined by arrows, a collaborator's cursor and their selection in orange" />
          </figure>
        </section>

        <section className="inside" aria-labelledby="inside-title">
          <h2 id="inside-title">Built from the document model up</h2>
          <p className="inside-lead">
            No whiteboard framework underneath. Every piece below is written for this project and
            covered by 120 automated tests.
          </p>
          <div className="inside-grid">
            <article className="feature">
              <h3>Edits never collide</h3>
              <p>
                Each shape is its own CRDT map. Two people can move and recolor the same note at
                once, and both changes land.
              </p>
              <div
                className="crop"
                role="img"
                aria-label="Close-up of a sticky note selected by a collaborator, outlined in their color"
              />
            </article>
            <ul className="facts">
              <Fact icon={<ArrowCounterClockwiseIcon />} title="Undo that respects others">
                Undo reverts your own edits, never a collaborator's.
              </Fact>
              <Fact icon={<WifiSlashIcon />} title="Works offline">
                Boards are kept in the browser and merge with the server when the connection
                returns.
              </Fact>
              <Fact icon={<LightningIcon />} title="Fast with thousands of shapes">
                A spatial index finds what is on screen in 9 µs among 10,000 shapes, about 20 times
                faster than a scan.
              </Fact>
            </ul>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <span>TypeScript, React, Yjs and Node.</span>
        <a href={SOURCE_URL}>Source on GitHub</a>
      </footer>
    </div>
  )
}
