import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';

import { Icon, type IconName } from './Icon';
import { APressable, usePressScale } from './Motion';
import { Text, type Tone } from './Text';

// ---- Avatars ---------------------------------------------------------------------------

const avatarBg = ['bg-avatar-0', 'bg-avatar-1', 'bg-avatar-2', 'bg-avatar-3', 'bg-avatar-4', 'bg-avatar-5', 'bg-avatar-6', 'bg-avatar-7'];
const sizes = { xs: [22, 11], sm: [28, 13], md: [40, 16], lg: [48, 19], xl: [72, 30] } as const;

type AvatarProps = {
  name: string;
  color?: number;
  size?: keyof typeof sizes;
  /** green dot = free now, grey = busy */
  presence?: 'free' | 'busy';
  ring?: 'surface' | 'together' | 'you';
};

export function Avatar({ name, color = 1, size = 'md', presence, ring }: AvatarProps) {
  const [px, fs] = sizes[size];
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  const isYou = color % 8 === 0;
  return (
    <View
      className={cn(
        'rounded-full items-center justify-center',
        avatarBg[((color % 8) + 8) % 8],
        ring === 'surface' && 'border-2 border-surface',
        ring === 'together' && 'border-2 border-together-soft',
        ring === 'you' && 'border-2 border-you',
      )}
      style={{ width: px, height: px }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text bold style={{ fontSize: fs, lineHeight: fs + 2, color: isYou ? '#FFFFFF' : '#161F2A' }}>
        {initial}
      </Text>
      {presence ? (
        <View
          className={cn(
            'absolute -right-0.5 -bottom-0.5 w-3.5 h-3.5 rounded-full border-[2.5px] border-surface',
            presence === 'free' ? 'bg-success' : 'bg-control-off',
          )}
        />
      ) : null}
    </View>
  );
}

export function AvatarStack({ people, size = 'sm', ring = 'surface' }: { people: { name: string; color: number }[]; size?: 'xs' | 'sm' | 'md'; ring?: 'surface' | 'together' | 'you' }) {
  return (
    <View className="flex-row items-center">
      {people.slice(0, 3).map((p, i) => (
        <View key={`${p.name}${i}`} style={{ marginLeft: i ? (size === 'xs' ? -8 : -12) : 0 }}>
          <Avatar name={p.name} color={p.color} size={size} ring={ring} />
        </View>
      ))}
    </View>
  );
}

// ---- Tags ------------------------------------------------------------------------------

// [background, text tone, icon color token]
const tagStyles = {
  together: ['bg-together', 'onTogether', '#161F2A'],
  bad: ['bg-danger-soft', 'danger', 'danger-ink'],
  ok: ['bg-success-soft', 'success', 'success-ink'],
  you: ['bg-you-soft', 'you', 'you-ink'],
  friend: ['bg-friend-soft', 'friend', 'friend-ink'],
  neutral: ['bg-surface-sunken', 'ink2', 'ink-2'],
  line: ['border-[1.5px] border-ink-2', 'ink2', 'ink-2'],
  ink: ['bg-ink', 'inverse', 'ink-inverse'],
  premium: ['bg-premium', 'onTogether', '#161F2A'],
} as const;

export function Tag({ kind = 'neutral', icon, children }: { kind?: keyof typeof tagStyles; icon?: IconName; children: string }) {
  const [bg, tone, iconColor] = tagStyles[kind];
  return (
    <View className={cn('flex-row items-center gap-1 min-h-6 px-2 py-0.5 rounded-md self-start', bg)}>
      {icon ? <Icon name={icon} size={14} color={iconColor} strokeWidth={2.5} /> : null}
      <Text variant="xs" bold tone={tone as Tone}>
        {children}
      </Text>
    </View>
  );
}

// ---- Chips -----------------------------------------------------------------------------

type ChipProps = {
  label: string;
  state?: 'default' | 'on' | 'sel' | 'off';
  icon?: IconName;
  onPress?: () => void;
  accessibilityLabel?: string;
  left?: ReactNode;
};

/** on = chosen (ink fill), sel = picked option (soft blue), off = switched off (dashed) */
export function Chip({ label, state = 'default', icon, onPress, accessibilityLabel, left }: ChipProps) {
  const tone: Tone = state === 'on' ? 'inverse' : state === 'off' ? 'ink2' : 'ink';
  const press = usePressScale(0.94);
  return (
    <APressable
      onPress={onPress}
      {...press.handlers}
      style={press.style}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: state === 'on' || state === 'sel' }}
      className={cn(
        'min-h-11 px-4 rounded-chip border-[1.5px] flex-row items-center gap-2 active:opacity-90',
        state === 'default' && 'bg-surface border-line-strong',
        state === 'on' && 'bg-ink border-ink',
        state === 'sel' && 'bg-you-soft border-you',
        state === 'off' && 'border-dashed border-control-off',
      )}
    >
      {left}
      {icon ? (
        <Icon name={icon} size={16} color={state === 'on' ? 'ink-inverse' : state === 'off' ? 'ink-2' : 'ink'} strokeWidth={2.5} />
      ) : null}
      <Text variant="sm" bold tone={tone}>
        {label}
      </Text>
    </APressable>
  );
}

// ---- Banners ---------------------------------------------------------------------------

export function Banner({ kind = 'neutral', icon, title, body, action }: { kind?: 'neutral' | 'ink' | 'bad'; icon?: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <View
      accessibilityRole="alert"
      className={cn(
        'flex-row items-center gap-2.5 px-3.5 py-3 rounded-card border',
        kind === 'neutral' && 'bg-surface-sunken border-line',
        kind === 'ink' && 'bg-ink border-ink',
        kind === 'bad' && 'bg-danger-soft border-transparent',
      )}
    >
      {icon ? <Icon name={icon} size={20} color={kind === 'ink' ? 'ink-inverse' : kind === 'bad' ? 'danger-ink' : 'ink-2'} /> : null}
      <View className="flex-1 gap-0.5">
        <Text variant="sm" bold tone={kind === 'ink' ? 'inverse' : 'ink'}>
          {title}
        </Text>
        {body ? (
          <Text variant="sm" tone={kind === 'ink' ? 'inverse' : 'ink2'}>
            {body}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

// ---- Selection controls ----------------------------------------------------------------

export function Radio({ on }: { on: boolean }) {
  return (
    <View className={cn('w-6 h-6 rounded-full border-2 items-center justify-center', on ? 'border-you' : 'border-control-off')}>
      {on ? <View className="w-3 h-3 rounded-full bg-you" /> : null}
    </View>
  );
}

export function Check({ on }: { on: boolean }) {
  return (
    <View className={cn('w-6 h-6 rounded-md border-2 items-center justify-center', on ? 'bg-you border-you' : 'border-control-off')}>
      {on ? <Icon name="check" size={16} color="#FFFFFF" strokeWidth={3} /> : null}
    </View>
  );
}

/** Option as a bordered row (sheets: "Ik kom naar jou") */
export function Option({ label, sub, on, onPress, multi }: { label: string; sub?: string; on: boolean; onPress: () => void; multi?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: on }}
      className={cn(
        'flex-row items-center gap-3 min-h-[52px] px-4 py-3 rounded-card',
        on ? 'border-2 border-you bg-you-soft' : 'border-[1.5px] border-line-strong bg-surface',
      )}
    >
      {multi ? <Check on={on} /> : <Radio on={on} />}
      <View className="flex-1">
        <Text bold>{label}</Text>
        {sub ? (
          <Text variant="sm" tone="ink2">
            {sub}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Two-up status picker on Today ("Ik wil chillen") */
export function StatusOption({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      className={cn(
        'flex-row items-center gap-2.5 min-h-14 px-3.5 rounded-card grow basis-[45%]',
        on ? 'border-2 border-you bg-you-soft' : 'border-[1.5px] border-line-strong bg-surface',
      )}
    >
      <Radio on={on} />
      <Text variant="sm" bold className="flex-1">
        {label}
      </Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View accessibilityRole="tablist" className="flex-row bg-surface-sunken rounded-card p-[3px] gap-[3px] border border-line">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            className={cn('flex-1 min-h-10 rounded-[9px] items-center justify-center', on && 'bg-surface border-[1.5px] border-ink')}
          >
            <Text variant="sm" bold tone={on ? 'ink' : 'ink2'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small round "ic" tile used in settings rows */
export function IconTile({ name, tone = 'ink' }: { name: IconName; tone?: string }) {
  return (
    <View className="w-9 h-9 rounded-[10px] items-center justify-center bg-surface-sunken">
      <Icon name={name} size={20} color={tone} />
    </View>
  );
}

/** Rose pill with a number of unread messages (chat list, the Chat tab). */
export function Badge({ n, className }: { n: number; className?: string }) {
  return (
    <View className={cn('min-w-[18px] h-[18px] px-[5px] rounded-full bg-friend items-center justify-center', className)}>
      <Text bold className="text-on-friend" style={{ fontSize: 11, lineHeight: 18 }}>
        {n > 99 ? '99+' : String(n)}
      </Text>
    </View>
  );
}
