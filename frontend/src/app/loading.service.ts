import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  readonly isLoading = signal(false);
  private pendingRequests = 0;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    this.pendingRequests += 1;
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.isLoading.set(true);
  }

  stop(): void {
    this.pendingRequests = Math.max(0, this.pendingRequests - 1);
    if (this.pendingRequests > 0) return;

    this.hideTimer = setTimeout(() => {
      if (this.pendingRequests === 0) this.isLoading.set(false);
      this.hideTimer = null;
    }, 180);
  }
}
