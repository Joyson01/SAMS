import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { IconButton } from './IconButton';
export function initializeTheme() {
  let saved: string | null = null;
  try { saved = localStorage.getItem('attedel-theme'); } catch { /* Browser storage may be disabled. */ }
  const dark = saved === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  return dark;
}
export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  return <IconButton label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => {
    const next = !dark; setDark(next); document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('attedel-theme', next ? 'dark' : 'light'); } catch { /* Theme still works without persistence. */ }
  }}>{dark ? <Sun size={18}/> : <Moon size={18}/>}</IconButton>;
}
