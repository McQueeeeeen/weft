import type { ToolId } from '@weft/core'
import type { ReactNode } from 'react'

function Glyph({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    >
      {children}
    </svg>
  )
}

export const TOOL_ICONS: Record<ToolId, ReactNode> = {
  select: (
    <Glyph>
      <path
        d="M5 3.5v12l3.4-3.3 2.3 4.8 2-.9-2.3-4.7h4.6z"
        fill="currentColor"
        fillOpacity="0.12"
      />
    </Glyph>
  ),
  hand: (
    <Glyph>
      <path d="M7 10V4.8a1.2 1.2 0 0 1 2.4 0V9m0-.5V3.7a1.2 1.2 0 0 1 2.4 0V9m0-4a1.2 1.2 0 0 1 2.4 0v5.5m0-3a1.2 1.2 0 0 1 2.3 0v4.3c0 3-2.2 5.2-5.2 5.2h-.9c-1.8 0-3.1-.8-4.1-2.2L3.6 12a1.2 1.2 0 0 1 2-1.4L7 12" />
    </Glyph>
  ),
  rect: (
    <Glyph>
      <rect x="3.5" y="5" width="13" height="10" rx="1" />
    </Glyph>
  ),
  ellipse: (
    <Glyph>
      <ellipse cx="10" cy="10" rx="6.5" ry="5.5" />
    </Glyph>
  ),
  sticky: (
    <Glyph>
      <path d="M4 4h12v8l-4 4H4z" fill="currentColor" fillOpacity="0.12" />
      <path d="M16 12h-4v4" />
    </Glyph>
  ),
  text: (
    <Glyph>
      <path d="M5 5h10M10 5v11M8 16h4" />
    </Glyph>
  ),
  arrow: (
    <Glyph>
      <path d="M4 16 16 4M9.5 4H16v6.5" />
    </Glyph>
  ),
  pen: (
    <Glyph>
      <path d="M3.5 14.5c2-1 2.7-5.5 5-5.5 2.2 0 1.5 4 3.5 4 1.8 0 2.4-4.5 4.5-6" />
    </Glyph>
  ),
}

export const UndoIcon = () => (
  <Glyph>
    <path d="M7.5 6 4 9.5 7.5 13" />
    <path d="M4.5 9.5H12a4 4 0 0 1 0 8h-1.5" />
  </Glyph>
)

export const RedoIcon = () => (
  <Glyph>
    <path d="M12.5 6 16 9.5 12.5 13" />
    <path d="M15.5 9.5H8a4 4 0 0 0 0 8h1.5" />
  </Glyph>
)

export const MinusIcon = () => (
  <Glyph>
    <path d="M5 10h10" />
  </Glyph>
)

export const PlusIcon = () => (
  <Glyph>
    <path d="M5 10h10M10 5v10" />
  </Glyph>
)

export const FitIcon = () => (
  <Glyph>
    <path d="M4 7.5V4h3.5M12.5 4H16v3.5M16 12.5V16h-3.5M7.5 16H4v-3.5" />
  </Glyph>
)

export const MoreIcon = () => (
  <Glyph>
    <circle cx="5" cy="10" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="10" cy="10" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="10" r="1.1" fill="currentColor" stroke="none" />
  </Glyph>
)

export const CloseIcon = () => (
  <Glyph>
    <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
  </Glyph>
)
