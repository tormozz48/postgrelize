const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

/**
 * Formats dates as local wall-clock text, the stored form of `TIMESTAMP WITHOUT TIME ZONE`.
 *
 * @internal
 */
export class WallClock {
  /**
   * Formats a date in the process time zone.
   *
   * @param date - Date to format.
   * @returns `YYYY-MM-DD HH:MM:SS.mmm`.
   */
  format(date: Date): string {
    const day = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
  }
}
