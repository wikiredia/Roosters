import { Text as RNText, type TextProps } from 'react-native';

import { cn } from '@/lib/cn';

/**
 * Text from the design system. Atkinson Hyperlegible Next for everything you read,
 * Bricolage Grotesque only for screen titles, big numbers and the wordmark.
 * Times and numbers always use tabular figures so they line up.
 */
const variants = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  sheet: 'text-xl font-display',
  title: 'text-2xl font-display',
  titleXl: 'text-3xl font-display',
  bignum: 'text-4xl font-display',
  eyebrow: 'text-xs uppercase',
} as const;

const tones = {
  ink: 'text-ink',
  ink2: 'text-ink-2',
  ink3: 'text-ink-3',
  inverse: 'text-ink-inverse',
  you: 'text-you-ink',
  onYou: 'text-on-you',
  // Blue on a white button, the same in light and dark mode
  onWhite: 'text-[#1D3FD0]',
  friend: 'text-friend-ink',
  together: 'text-together-ink',
  onTogether: 'text-on-together',
  danger: 'text-danger-ink',
  success: 'text-success-ink',
  premium: 'text-premium-ink',
} as const;

export type TextVariant = keyof typeof variants;
export type Tone = keyof typeof tones;

type Props = TextProps & {
  variant?: TextVariant;
  tone?: Tone;
  bold?: boolean;
  strike?: boolean;
  className?: string;
};

const display: TextVariant[] = ['sheet', 'title', 'titleXl', 'bignum'];

export function Text({ variant = 'base', tone, bold, strike, className, style, ...rest }: Props) {
  const isDisplay = display.includes(variant);
  const family = isDisplay ? '' : bold || variant === 'eyebrow' ? 'font-ui-bold' : 'font-ui';
  return (
    <RNText
      maxFontSizeMultiplier={2}
      className={cn(
        variants[variant],
        family,
        tones[tone ?? (variant === 'eyebrow' ? 'ink2' : 'ink')],
        strike && 'line-through',
        className,
      )}
      style={[{ fontVariant: ['tabular-nums'] }, isDisplay && { letterSpacing: -0.3 }, variant === 'eyebrow' && { letterSpacing: 1 }, style]}
      {...rest}
    />
  );
}
