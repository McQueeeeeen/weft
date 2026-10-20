import { Dialog } from './Dialog.tsx'

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Tools',
    rows: [
      ['V', 'Select'],
      ['H or hold Space', 'Pan'],
      ['R', 'Rectangle'],
      ['O', 'Ellipse'],
      ['S', 'Sticky note'],
      ['T or double-click', 'Text'],
      ['A', 'Arrow (start or end on a shape to connect it)'],
      ['P', 'Pen'],
    ],
  },
  {
    title: 'Editing',
    rows: [
      [`${MOD} Z`, 'Undo your last change'],
      [`${MOD} Shift Z`, 'Redo'],
      [`${MOD} C / X / V`, 'Copy, cut, paste'],
      [`${MOD} D or Alt drag`, 'Duplicate'],
      [`${MOD} A`, 'Select all'],
      ['Delete', 'Delete selection'],
      ['Arrow keys', 'Nudge (Shift: 10 units)'],
      ['] and [', 'Bring to front, send to back'],
      ['Enter', 'Edit text of the selected note'],
      ['Shift while dragging', 'Lock axis, keep proportions'],
      ['Escape', 'Cancel, deselect'],
    ],
  },
  {
    title: 'View',
    rows: [
      [`${MOD} scroll or pinch`, 'Zoom at the pointer'],
      [`${MOD} + / ${MOD} -`, 'Zoom in, zoom out'],
      [`${MOD} 0`, 'Zoom to 100%'],
      ['Shift 1', 'Fit the whole board'],
      ['Shift 2', 'Fit the selection'],
    ],
  },
]

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} title="Keyboard shortcuts" onClose={onClose} wide>
      <div className="shortcut-groups">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3>{group.title}</h3>
            <dl>
              {group.rows.map(([keys, action]) => (
                <div key={keys} className="shortcut-row">
                  <dt>
                    <kbd>{keys}</kbd>
                  </dt>
                  <dd>{action}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
