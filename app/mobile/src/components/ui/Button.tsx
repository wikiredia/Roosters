import { cva, type VariantProps } from 'class-variance-authority';
import { ActivityIndicator, type PressableProps, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { cn } from '@/lib/cn';

import { Icon, type IconName } from './Icon';
import { APressable, usePressScale } from './Motion';
import { Text, type Tone } from './Text';

const box = cva('flex-row items-center justify-center gap-2 active:opacity-90', {
  variants: {
    variant: {
      primary: 'bg-you',
      secondary: 'bg-surface border-[1.5px] border-control-off',
      ghost: '',
      danger: 'bg-danger-strong',
      ink: 'bg-ink',
      tonal: 'bg-you-soft',
      // White button on the blue Now card
      onYou: 'bg-white',
      together: 'bg-together',
    },
    size: {
      md: 'min-h-[52px] px-5 rounded-button self-stretch',
      sm: 'min-h-11 px-4 rounded-[10px]',
      icon: 'w-11 h-11 rounded-full',
    },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

const textTone: Record<string, Tone> = {
  primary: 'onYou',
  secondary: 'ink',
  ghost: 'you',
  danger: 'onYou',
  ink: 'inverse',
  tonal: 'ink',
  onYou: 'onWhite',
  together: 'onTogether',
};

const iconColor: Record<string, string> = {
  primary: '#FFFFFF',
  secondary: 'ink',
  ghost: 'you-ink',
  danger: '#FFFFFF',
  ink: 'ink-inverse',
  tonal: 'ink',
  onYou: '#1D3FD0',
  together: '#161F2A',
};

type Props = Omit<PressableProps, 'children'> &
  VariantProps<typeof box> & {
    label?: string;
    icon?: IconName;
    loading?: boolean;
    className?: string;
  };

export function Button({ label, icon, variant = 'primary', size = 'md', loading, disabled, className, style, onPressIn, onPressOut, ...rest }: Props) {
  const v = variant ?? 'primary';
  const spinner = useCSSVariable(v === 'secondary' || v === 'tonal' ? '--color-ink' : '--color-on-you');
  const press = usePressScale(size === 'md' ? 0.97 : 0.94, { onPressIn, onPressOut });
  return (
    <APressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      accessibilityLabel={rest.accessibilityLabel ?? label}
      disabled={disabled || loading}
      className={cn(box({ variant, size }), (disabled || loading) && 'opacity-50', className)}
      hitSlop={size === 'icon' ? 4 : undefined}
      {...rest}
      {...press.handlers}
      style={[style as object, press.style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={String(spinner ?? '#FFFFFF')} />
      ) : icon ? (
        <Icon name={icon} size={size === 'md' ? 22 : 20} color={iconColor[v]} />
      ) : null}
      {label ? (
        <Text variant={size === 'md' ? 'base' : 'sm'} bold tone={textTone[v]} numberOfLines={2} className="text-center">
          {label}
        </Text>
      ) : null}
    </APressable>
  );
}

/** Round icon-only button (close, back, chat). Always needs a label for screen readers. */
export function IconButton({
  icon,
  label,
  filled,
  color = 'ink',
  className,
  style,
  onPressIn,
  onPressOut,
  ...rest
}: Omit<PressableProps, 'children'> & { icon: IconName; label: string; filled?: boolean; color?: string; className?: string }) {
  const press = usePressScale(0.88, { onPressIn, onPressOut });
  return (
    <APressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      className={cn(
        'w-11 h-11 rounded-full items-center justify-center active:opacity-80',
        filled && 'bg-surface border border-line-strong',
        rest.disabled && 'opacity-40',
        className,
      )}
      {...rest}
      {...press.handlers}
      style={[style as object, press.style]}
    >
      <View>
        <Icon name={icon} size={filled ? 20 : 24} color={color} />
      </View>
    </APressable>
  );
}
