/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import 'katex/dist/katex.min.css'
import { escapeHtml } from './markdown-escape'

type SequenceMessage = {
  from?: string
  isNote?: boolean
  label: string
  lineStyle?: 'solid' | 'dashed'
  noteSide?: 'left' | 'right'
  target: string
  to?: string
}

function parseSequenceDiagram(source: string): {
  messages: SequenceMessage[]
  participants: string[]
} {
  const lines = source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const participants: string[] = []
  const messages: SequenceMessage[] = []

  function addParticipant(name: string): void {
    if (!participants.includes(name)) {
      participants.push(name)
    }
  }

  lines.forEach((line) => {
    const noteMatch = /^Note\s+(left|right)\s+of\s+([^:]+):\s*(.+)$/.exec(line)

    if (noteMatch) {
      const [, side, target, label] = noteMatch
      const participant = target.trim()
      addParticipant(participant)
      messages.push({
        isNote: true,
        label: label.replaceAll('\\n', '\n'),
        noteSide: side as 'left' | 'right',
        target: participant,
      })
      return
    }

    const messageMatch = /^([^-\s]+)\s*(-{1,2}>>?|-->)\s*([^:]+):\s*(.+)$/.exec(
      line
    )

    if (!messageMatch) {
      return
    }

    const [, from, arrow, to, label] = messageMatch
    const fromName = from.trim()
    const toName = to.trim()
    addParticipant(fromName)
    addParticipant(toName)
    messages.push({
      from: fromName,
      label,
      lineStyle: arrow.startsWith('--') ? 'dashed' : 'solid',
      target: toName,
      to: toName,
    })
  })

  return { messages, participants }
}

export function renderSequenceDiagram(source: string): string {
  const { messages, participants } = parseSequenceDiagram(source)
  const laneGap = 190
  const marginX = 80
  const top = 42
  const rowGap = 72
  const width = Math.max(
    360,
    marginX * 2 + Math.max(0, participants.length - 1) * laneGap
  )
  const height = Math.max(180, 126 + messages.length * rowGap)
  const positions = new Map(
    participants.map((participant, index) => [
      participant,
      marginX + index * laneGap,
    ])
  )
  const participantBoxes = participants
    .map((participant) => {
      const x = positions.get(participant) ?? marginX
      const label = escapeHtml(participant)

      return `
        <rect x="${x - 64}" y="${top}" width="128" height="44" rx="4" ry="4" class="markdown-diagram-node" />
        <text x="${x}" y="${top + 27}" text-anchor="middle" class="markdown-diagram-text">${label}</text>
        <line x1="${x}" y1="${top + 44}" x2="${x}" y2="${height - 46}" class="markdown-sequence-lifeline" />
        <rect x="${x - 64}" y="${height - 46}" width="128" height="44" rx="4" ry="4" class="markdown-diagram-node" />
        <text x="${x}" y="${height - 19}" text-anchor="middle" class="markdown-diagram-text">${label}</text>
      `
    })
    .join('')
  const renderedMessages = messages
    .map((message, index) => {
      const y = top + 78 + index * rowGap

      if (message.isNote) {
        const targetX = positions.get(message.target) ?? marginX
        const noteX = message.noteSide === 'left' ? targetX - 154 : targetX + 24
        const lines = message.label.split('\n')
        const noteHeight = 28 + Math.max(0, lines.length - 1) * 16
        const textLines = lines
          .map((line, lineIndex) => {
            return `<text x="${noteX + 8}" y="${y + 18 + lineIndex * 16}" class="markdown-sequence-note-text">${escapeHtml(line)}</text>`
          })
          .join('')

        return `
          <rect x="${noteX}" y="${y}" width="132" height="${noteHeight}" rx="3" ry="3" class="markdown-sequence-note" />
          ${textLines}
        `
      }

      const fromX = positions.get(message.from ?? '') ?? marginX
      const toX = positions.get(message.to ?? '') ?? marginX
      const labelX = (fromX + toX) / 2
      const label = escapeHtml(message.label)
      const dash =
        message.lineStyle === 'dashed' ? ' stroke-dasharray="4 4"' : ''

      return `
        <line x1="${fromX}" y1="${y}" x2="${toX}" y2="${y}" class="markdown-diagram-edge"${dash} marker-end="url(#markdown-diagram-arrow)" />
        <text x="${labelX}" y="${y - 8}" text-anchor="middle" class="markdown-diagram-edge-label">${label}</text>
      `
    })
    .join('')

  return `
    <div class="not-prose markdown-diagram">
      <svg data-diagram="sequence" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="xMidYMin meet">
        <defs>
          <marker id="markdown-diagram-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M 0 0 L 8 4 L 0 8 z" class="markdown-diagram-arrow" />
          </marker>
        </defs>
        ${participantBoxes}
        ${renderedMessages}
      </svg>
    </div>
  `
}
