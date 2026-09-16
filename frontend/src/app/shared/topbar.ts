/** Reads lx_current_user from localStorage and updates the avatar element with the user's initials. */
export function initTopBar(): void {
  try {
    const raw = localStorage.getItem('lx_current_user');
    if (!raw) return;
    const user = JSON.parse(raw);
    const name: string = user.name || user.email || '';
    const initials = name
      .split(/[\s.@]+/)
      .filter(Boolean)
      .map((w: string) => w[0].toUpperCase())
      .slice(0, 2)
      .join('');
    const avatar = document.getElementById('topBarAvatar');
    if (avatar) {
      avatar.textContent = initials || '?';
      avatar.title = `${name}${user.role ? ' (' + user.role + ')' : ''}`;
    }
  } catch (_) {}
}
