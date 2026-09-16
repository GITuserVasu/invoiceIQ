import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  const router = { navigate: jasmine.createSpy('navigate') };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: router }]
    });
    router.navigate.calls.reset();
  });

  it('allows navigation with an access token', () => {
    localStorage.setItem('accessToken', 'token');
    expect(TestBed.runInInjectionContext(() => authGuard({} as any, {} as any))).toBeTrue();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('redirects unauthenticated users to login', () => {
    expect(TestBed.runInInjectionContext(() => authGuard({} as any, {} as any))).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
