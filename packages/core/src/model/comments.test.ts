import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { partitionedPair, rect } from '../test-utils.ts'
import { Comments, threadPosition } from './comments.ts'

const dana = { name: 'Dana', color: 1 }
const sam = { name: 'Sam', color: 6 }
const free = { x: 10, y: 20, shape: null, dx: 0, dy: 0 }

describe('Comments', () => {
  it('syncs threads, replies and resolution between replicas', () => {
    const { a, b, sync } = partitionedPair()
    const left = new Comments(a.doc)
    const right = new Comments(b.doc)
    const id = left.create(free, dana, 'Is this final?', 1)
    sync()
    right.reply(id, sam, 'Not yet', 2)
    right.resolve(id, true)
    sync()
    expect(left.get(id)).toMatchObject({ resolved: true, x: 10, y: 20 })
    expect(left.get(id)!.messages.map((m) => [m.author.name, m.text])).toEqual([
      ['Dana', 'Is this final?'],
      ['Sam', 'Not yet'],
    ])
    left.remove(id)
    sync()
    expect(right.threads()).toEqual([])
  })

  it('pins a thread to a shape so it follows the shape and falls back when it is deleted', () => {
    const { a } = partitionedPair()
    const comments = new Comments(a.doc)
    const shape = a.create(rect(100, 100, 50, 50))
    const id = comments.create({ x: 110, y: 105, shape, dx: 10, dy: 5 }, dana, 'Bigger?', 1)
    a.update(shape, { x: 300 })
    expect(threadPosition(comments.get(id)!, a.lookup)).toEqual({ x: 310, y: 105 })
    a.delete([shape])
    expect(threadPosition(comments.get(id)!, a.lookup)).toEqual({ x: 110, y: 105 })
  })

  it('ignores malformed threads and messages from peers', () => {
    const doc = new Y.Doc()
    const root = doc.getMap<Y.Map<unknown>>('comments')
    const messages = new Y.Array<unknown>()
    messages.push([{ id: 'm', author: { name: 'x' }, text: 'no color', at: 1 }, 'junk'])
    root.set(
      'bad',
      new Y.Map<unknown>([
        ['x', 0],
        ['y', 0],
        ['dx', 0],
        ['dy', 0],
        ['messages', messages],
      ]),
    )
    root.set('worse', new Y.Map<unknown>([['x', 'nope']]))
    expect(new Comments(doc).threads()).toEqual([])
  })
})
