import { randomBytes } from 'node:crypto';

// 100 ns ticks between the start of the Gregorian calendar (1582-10-15) and the Unix epoch
const EPOCH_OFFSET = 122_192_928_000_000_000n;

/**
 * Time-based UUIDs (RFC 9562 version 1). Like the `uuid` package of Sequelize v6, the node id is
 * random (with the multicast bit set), never the MAC address of the machine.
 *
 * @internal
 */
export class UuidV1 {
  readonly #node: string;
  readonly #clockSequence: string;
  #last = 0n;

  constructor() {
    const random = randomBytes(8);
    random.writeUInt8(random.readUInt8(0) | 0x01, 0);
    this.#node = random.toString('hex', 0, 6);
    this.#clockSequence = ((random.readUInt16BE(6) & 0x3fff) | 0x8000).toString(16);
  }

  /** @returns The next UUID; ids of one instance never repeat, also within one millisecond. */
  next(): string {
    const now = BigInt(Date.now()) * 10_000n + EPOCH_OFFSET;
    this.#last = now > this.#last ? now : this.#last + 1n;
    const time = this.#last.toString(16).padStart(15, '0');
    return `${time.slice(7)}-${time.slice(3, 7)}-1${time.slice(0, 3)}-${this.#clockSequence}-${this.#node}`;
  }
}
