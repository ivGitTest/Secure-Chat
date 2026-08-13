/**
 * Design tokens — Minimal variant
 *
 * Palette: clean white + zinc greys + #0044FF accent
 * Typography: Inter, large sizing, bold labels with uppercase tracking
 * Radius: pill avatars/send, 2xl buttons/bubbles, square inputs (border-b only)
 */
const colors = {
  light: {
    text: '#09090b',        // zinc-950
    tint: '#0044FF',

    background: '#FFFFFF',  // pure white
    backgroundAlt: '#FAFAFA', // zinc-50 — chat message list

    foreground: '#09090b',

    card: '#FFFFFF',
    cardForeground: '#09090b',

    primary: '#0044FF',
    primaryForeground: '#FFFFFF',

    secondary: '#F4F4F5',   // zinc-100
    secondaryForeground: '#09090b',

    muted: '#F4F4F5',       // zinc-100
    mutedForeground: '#71717a', // zinc-500

    accent: '#0044FF1A',    // #0044FF at 10% opacity
    accentForeground: '#0044FF',

    destructive: '#DC2626', // red-600
    destructiveForeground: '#FFFFFF',

    border: '#E4E4E7',      // zinc-200
    borderStrong: '#D4D4D8', // zinc-300
    input: '#F4F4F5',       // zinc-100 — flat input background

    // Messenger-specific
    bubbleMe: '#0044FF',
    bubbleMeText: '#FFFFFF',
    bubbleThem: '#FFFFFF',
    bubbleThemText: '#09090b',

    // Call screen (dark)
    callBg: '#09090b',      // zinc-950
    callSurface: '#18181b', // zinc-900
    callSubtle: '#27272a',  // zinc-800

    accept: '#10B981',      // emerald-500
    acceptGlow: 'rgba(16,185,129,0.4)',
    reject: '#DC2626',      // red-600
    rejectGlow: 'rgba(220,38,38,0.4)',

    // Contacts screen — combo 2 approved mockup
    contactsBackground: '#F0F4FF',
    contactsSecondary: '#52525B',
    contactsMuted: '#A1A1AA',
    contactsBorder: 'rgba(0,68,255,0.14)',
    contactsLogout: '#EF4444',
    contactsOnline: '#10B981',
    contactsAvatarColors: [
      '#7B6FA0',
      '#5E8C7A',
      '#A07A5E',
      '#5E7A9C',
      '#8A6F6F',
      '#6B8A6B',
    ],
  },

  radius: 16,
};

export default colors;
