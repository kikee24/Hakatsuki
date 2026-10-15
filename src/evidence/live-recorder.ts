import { existsSync, statSync } from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';

const recorders = new WeakMap<Page, LiveRecorder>();

/**
 * Video of the hand-logged-in tab. Playwright's `video` option only records the browser it
 * launched (blank here); the page's screencast also records a tab attached over CDP.
 *
 * Recording is paused while the Betsson balance menu is open, because its first row shows the
 * player's name (see `offRecord`). Each pause ends a segment; every segment is attached as a video.
 * Set RECORD_LIVE=0 to turn it off.
 */
export class LiveRecorder {
  private readonly segments: string[] = [];
  private recording = false;
  private problem?: string;

  private constructor(
    private readonly page: Page,
    private readonly testInfo: TestInfo,
    private readonly size?: { width: number; height: number },
  ) {}

  static async start(page: Page, testInfo: TestInfo, size?: { width: number; height: number }): Promise<LiveRecorder | undefined> {
    if (process.env.RECORD_LIVE === '0') return undefined;
    const recorder = new LiveRecorder(page, testInfo, size);
    recorders.set(page, recorder);
    await recorder.resume();
    return recorder;
  }

  private async resume(): Promise<void> {
    if (this.recording || this.problem) return;
    const path = this.testInfo.outputPath(`live-video-${this.segments.length + 1}.webm`);
    try {
      await this.page.screencast.start({ path, size: this.size });
      this.segments.push(path);
      this.recording = true;
    } catch (e) {
      // No ffmpeg (npx playwright install ffmpeg) or no screencast support: the test goes on without video.
      this.problem = e instanceof Error ? e.message.split('\n')[0] : String(e);
    }
  }

  private async pause(): Promise<void> {
    if (!this.recording) return;
    this.recording = false;
    await this.page.screencast.stop().catch((e: unknown) => {
      this.problem = e instanceof Error ? e.message.split('\n')[0] : String(e);
    });
  }

  /**
   * Runs `action` with the recording paused, e.g. while personal data is on screen. If it throws,
   * the recording stays paused: whatever it was hiding may still be on screen.
   */
  async offRecord<T>(action: () => Promise<T>): Promise<T> {
    const wasRecording = this.recording;
    await this.pause();
    const result = await action();
    if (wasRecording) await this.resume();
    return result;
  }

  /** Stops recording and attaches every segment as "video" (or "video (1/2)", …). */
  async finish(): Promise<void> {
    await this.pause();
    recorders.delete(this.page);
    const files = this.segments.filter((f) => existsSync(f) && statSync(f).size > 0);
    for (const [i, path] of files.entries()) {
      await this.testInfo.attach(files.length > 1 ? `video (${i + 1}/${files.length})` : 'video', { path, contentType: 'video/webm' });
    }
    if (this.problem) await this.testInfo.attach('video not recorded', { body: this.problem, contentType: 'text/plain' });
  }
}

/** Runs `action` with the page's recording (if any) paused. */
export async function offRecord<T>(page: Page, action: () => Promise<T>): Promise<T> {
  const recorder = recorders.get(page);
  return recorder ? recorder.offRecord(action) : action();
}
