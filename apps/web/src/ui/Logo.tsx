export function Logo() {
  return (
    <span className="logo">
      <svg className="logo-mark" viewBox="0 3.5 32 17" aria-hidden="true">
        <g className="logo-warp">
          <circle cx="4" cy="12" r="2.25" />
          <circle cx="12" cy="12" r="2.25" />
          <circle cx="20" cy="12" r="2.25" />
          <circle cx="28" cy="12" r="2.25" />
        </g>
        <path
          className="logo-weft"
          d="M1 9C1.8 7.2 2.8 6.5 4 6.5C7.5 6.5 8.5 17.5 12 17.5C15.5 17.5 16.5 6.5 20 6.5C23.5 6.5 24.5 17.5 28 17.5C29.2 17.5 30.2 16.8 31 15"
        />
      </svg>
      <span className="logo-word">weft</span>
    </span>
  )
}
