import { test, type TestInfo } from '@playwright/test';
import type { CheckDefinition } from './check-catalog';

export interface CheckRecord {
  id: string;
  title: string;
  passed: boolean;
  /** The values that were compared, in words, so the report explains itself. */
  detail?: string;
}

/** Annotation type under which every check is stored; the check-matrix reporter reads these. */
export const CHECK_ANNOTATION = 'check';

/**
 * Named, individually reported checks. Each one is a report step ("[S1-04] ...") and uses soft
 * assertions, so one failed check does not hide the result of the others.
 */
export class Checks {
  readonly records: CheckRecord[] = [];

  constructor(private readonly testInfo: TestInfo) {}

  async verify(check: CheckDefinition, assertion: () => void | Promise<void>, detail?: string): Promise<boolean> {
    return test.step(`[${check.id}] ${check.title}`, async () => {
      const errorsBefore = this.testInfo.errors.length;
      await assertion();
      const record: CheckRecord = { ...check, passed: this.testInfo.errors.length === errorsBefore, detail };
      this.records.push(record);
      this.testInfo.annotations.push({ type: CHECK_ANNOTATION, description: JSON.stringify(record) });
      return record.passed;
    });
  }
}
