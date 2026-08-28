type PokerTableProps = { board?: string[] }

export function PokerTable({ board = [] }: PokerTableProps) {
  return <section aria-label="Poker table">Board: {board.join(' ') || 'No cards yet'}</section>
}
