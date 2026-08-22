export class RingBuffer<T> {
  readonly #items: Array<T | undefined>
  #start = 0
  #length = 0

  constructor(readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new RangeError('Ring buffer capacity must be a positive integer.')
    }
    this.#items = new Array<T | undefined>(capacity)
  }

  get length(): number {
    return this.#length
  }

  push(value: T): void {
    const index = (this.#start + this.#length) % this.capacity
    this.#items[index] = value
    if (this.#length === this.capacity) {
      this.#start = (this.#start + 1) % this.capacity
      return
    }
    this.#length += 1
  }

  clear(): void {
    this.#items.fill(undefined)
    this.#start = 0
    this.#length = 0
  }

  toArray(): T[] {
    const result: T[] = []
    for (let offset = 0; offset < this.#length; offset += 1) {
      const value = this.#items[(this.#start + offset) % this.capacity]
      if (value !== undefined) result.push(value)
    }
    return result
  }
}
