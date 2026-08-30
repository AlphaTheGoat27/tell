import type { SVGProps } from 'react'

/** Vector SVG poker suit icons with clean curves and sharp geometry */
export function SuitIcon({
  suit,
  className = '',
  size,
  style,
  ...props
}: {
  suit: string
  size?: number | string
  className?: string
  style?: React.CSSProperties
} & SVGProps<SVGSVGElement>) {
  const s = suit ? suit.slice(-1).toLowerCase() : 's'
  const iconSize = size ?? '1em'

  if (s === 's' || s === '♠') {
    return (
      <svg
        viewBox="0 0 24 24"
        width={iconSize}
        height={iconSize}
        fill="currentColor"
        className={`suit-icon suit-s ${className}`}
        style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
        aria-hidden="true"
        {...props}
      >
        <path d="M12 2.2C10.6 5.8 4.5 10.4 4.5 14.5c0 3 2.4 5 5.2 5 1.4 0 2.2-.6 2.3-.7-.1 1.2-.4 3.2-2 4.2h4c-1.6-1-1.9-3-2-4.2.1.1.9.7 2.3.7 2.8 0 5.2-2 5.2-5 0-4.1-6.1-8.7-7.5-12.3z" />
      </svg>
    )
  }
  if (s === 'h' || s === '♥') {
    return (
      <svg
        viewBox="0 0 24 24"
        width={iconSize}
        height={iconSize}
        fill="currentColor"
        className={`suit-icon suit-h ${className}`}
        style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
        aria-hidden="true"
        {...props}
      >
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    )
  }
  if (s === 'd' || s === '♦') {
    return (
      <svg
        viewBox="0 0 24 24"
        width={iconSize}
        height={iconSize}
        fill="currentColor"
        className={`suit-icon suit-d ${className}`}
        style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
        aria-hidden="true"
        {...props}
      >
        <path d="M12 2L3.5 12 12 22l8.5-10L12 2z" />
      </svg>
    )
  }
  if (s === 'c' || s === '♣') {
    return (
      <svg
        viewBox="0 0 24 24"
        width={iconSize}
        height={iconSize}
        fill="currentColor"
        className={`suit-icon suit-c ${className}`}
        style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
        aria-hidden="true"
        {...props}
      >
        <path d="M12 2a4 4 0 0 0-4 4c0 1.2.5 2.2 1.3 2.9A4.5 4.5 0 0 0 5 13a4.5 4.5 0 0 0 4.4 4.5c.9 0 1.8-.3 2.6-.9-.1 1.2-.5 3.4-2 4.4h4c-1.5-1-1.9-3.2-2-4.4.8.6 1.7.9 2.6.9A4.5 4.5 0 0 0 23 13a4.5 4.5 0 0 0-4.3-4.1c.8-.7 1.3-1.7 1.3-2.9a4 4 0 0 0-4-4 4 4 0 0 0-4 4z" />
      </svg>
    )
  }
  return <span>{suit}</span>
}
