import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class EntityAccessService {
  private permissions = new Set<string>();
  private loaded = false;

  setPermissions(permissions: string[]): void {
    this.permissions = new Set(permissions);
    this.loaded = true;
  }

  has(permission: string): boolean {
    try {
      const user = JSON.parse(localStorage.getItem('authUser') || '{}');
      if (user.role === 'super_admin') return true;
    } catch { /* use loaded permissions */ }
    return this.permissions.has(permission);
  }

  hasAny(...permissions: string[]): boolean {
    return permissions.some((permission) => this.has(permission));
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}
