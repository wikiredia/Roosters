import type { ReactNode } from 'react';
import { Pressable, type PressableProps, View, type ViewProps } from 'react-native';

import { cn } from '@/lib/cn';

import { Icon } from './Icon';
import { Text } from './Text';

/** White card with a hairline border. Rows inside get dividers. */
export function Card({ className, ...rest }: ViewProps & { className?: string }) {
  return <View className={cn('bg-surface rounded-card border border-line overflow-hidden', className)} {...rest} />;
}

/** The yellow "together" card: shared breaks. */
export function TogetherCard({ className, ...rest }: ViewProps & { className?: string }) {
  return (
    <View className={cn('bg-together-soft rounded-card border-[1.5px] border-together overflow-hidden', className)} {...rest} />
  );
}

type RowProps = Omit<PressableProps, 'children'> & {
  title?: string;
  sub?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  chevron?: boolean;
  first?: boolean;
  divider?: 'line' | 'together';
  tone?: 'ink' | 'danger' | 'you';
  className?: string;
};

/** A list row: min 64 high, title + sub line, optional left (avatar/icon) and right (value/button). */
export function Row({ title, sub, left, right, children, chevron, first, divider = 'line', tone = 'ink', className, onPress, ...rest }: RowProps) {
  const content = (
    <>
      {left}
      <View className="flex-1 min-w-0 gap-0.5">
        {title ? (
          <Text bold tone={tone === 'danger' ? 'danger' : tone === 'you' ? 'you' : 'ink'}>
            {title}
          </Text>
        ) : null}
        {typeof sub === 'string' ? (
          <Text variant="sm" tone="ink2">
            {sub}
          </Text>
        ) : (
          sub
        )}
        {children}
      </View>
      {right ? <View className="shrink-0">{right}</View> : null}
      {chevron ? <Icon name="forward" size={20} color="ink-3" /> : null}
    </>
  );
  const base = cn(
    'flex-row items-center gap-3 px-4 py-3 min-h-16',
    !first && (divider === 'together' ? 'border-t border-together' : 'border-t border-line'),
    className,
  );
  if (!onPress) return <View className={base}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className={cn(base, 'active:bg-surface-sunken')} {...rest}>
      {content}
    </Pressable>
  );
}

/** Section title row: "Wie is er nu?" ... "vrij eerst" */
export function SectionHead({ title, aside, left }: { title: string; aside?: ReactNode; left?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between gap-3 min-h-7">
      <View className="flex-row items-center gap-2 flex-1">
        {left}
        <Text bold accessibilityRole="header">
          {title}
        </Text>
      </View>
      {typeof aside === 'string' ? (
        <Text variant="sm" tone="ink2">
          {aside}
        </Text>
      ) : (
        aside
      )}
    </View>
  );
}

export function Section({ className, ...rest }: ViewProps & { className?: string }) {
  return <View className={cn('gap-3', className)} {...rest} />;
}

/** Small uppercase heading above a list */
export function ListHead({ children }: { children: string }) {
  return (
    <Text variant="eyebrow" className="pb-2">
      {children}
    </Text>
  );
}

export function Divider() {
  return <View className="h-px bg-line" />;
}

/** The yellow circle with the cup: marks "together" next to a title. */
export function TogetherIcon({ size = 28 }: { size?: number }) {
  return (
    <View className="bg-together rounded-full items-center justify-center" style={{ width: size, height: size }}>
      <Icon name="together" size={size * 0.57} color="#161F2A" strokeWidth={2} />
    </View>
  );
}
