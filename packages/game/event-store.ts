/** State and events are plain data. Each store owns its snapshot, subscriptions and queue. */
type Immutable<T> = { readonly [K in keyof T]: Immutable<T[K]> }

// The event contract contains only acyclic records, arrays and primitive values.
function copyData<T>(value: T): T {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(copyData) as T
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyData(item)])) as T
}

function observe<T>(group: Set<T>, observer: T) {
  group.add(observer)
  return () => { group.delete(observer) }
}

function notify<T>(group: Set<T>, call: (observer: T) => void, errors: unknown[]) {
  for (const observer of [...group]) {
    if (!group.has(observer)) continue
    try { call(observer) } catch (error) { errors.push(error) }
  }
}

/** Deliver an accepted one-shot event with the current snapshot. */
export const acceptWithoutChange = Symbol("acceptWithoutChange")

export function createEventStore<State extends object, Event extends { type: string }, Notice extends { type: string } = never>(
  initial: State,
  reduce: (state: State, event: Event) => State | typeof acceptWithoutChange,
  notices?: (event: Event, next: State, previous: State) => readonly Notice[],
) {
  const frozen = new WeakSet<object>()
  function freezeData(value: unknown): void {
    if (value === null || typeof value !== "object" || frozen.has(value)) return
    frozen.add(value)
    for (const child of Object.values(value)) freezeData(child)
    Object.freeze(value)
  }

  let state = copyData(initial)
  freezeData(state)
  const getSnapshot = (): Immutable<State> => state as Immutable<State>
  type Message = Event | Notice
  const observers = new Set<(message: Message, snapshot: Immutable<State>) => void>()
  const subscribers = new Set<() => void>()
  const queue: Event[] = []
  let dispatching = false

  function on<K extends Message["type"]>(type: K,
    observer: (event: Immutable<Extract<Message, { type: K }>>, snapshot: Immutable<State>) => void) {
    return observe(observers, (message, snapshot) => {
      if (message.type === type) observer(message as Immutable<Extract<Message, { type: K }>>, snapshot)
    })
  }

  function dispatch(event: Event): void {
    const owned = copyData(event)
    freezeData(owned)
    queue.push(owned)
    if (dispatching) return
    dispatching = true
    const errors: unknown[] = []
    try {
      // Observers may append events. Finish broadcasting this commit before running the next.
      for (const input of queue) {
        const result = reduce(state, input)
        if (result === state) continue
        const next = result === acceptWithoutChange ? state : result
        freezeData(next)
        const messages: Message[] = [input, ...(notices?.(input, next, state) ?? [])]
        state = next
        if (result !== acceptWithoutChange) notify(subscribers, listener => listener(), errors)
        for (const message of messages) {
          freezeData(message)
          notify(observers, listener => listener(message, getSnapshot()), errors)
        }
      }
    } finally {
      dispatching = false
      queue.length = 0
    }
    if (errors.length) throw new AggregateError(errors, "Game event observer failed")
  }

  return { getSnapshot, dispatch, on, subscribe: (listener: () => void) => observe(subscribers, () => listener()) }
}
