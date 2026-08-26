import type { LogRecord, Sink } from "@logtape/logtape";

export interface RecordingSink {
  sink: Sink;
  records: LogRecord[];
  clear(): void;
}

/** A sink that keeps records in memory so a test can assert on them. */
export function recordingSink(): RecordingSink {
  const records: LogRecord[] = [];

  return {
    sink: (record) => {
      records.push(record);
    },
    records,
    clear: () => {
      records.length = 0;
    },
  };
}
