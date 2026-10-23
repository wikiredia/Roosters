import { useRef, useState } from 'react';
import { Pressable, Switch, TextInput, type TextInputProps, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { cn } from '@/lib/cn';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type InputProps = TextInputProps & { label?: string; hint?: string; error?: string; icon?: IconName; className?: string };

/** Labelled text field: 52 high, blue border when focused, red with a message on error. */
export function Input({ label, hint, error, icon, className, onFocus, onBlur, ...rest }: InputProps) {
  const [focus, setFocus] = useState(false);
  const placeholder = useCSSVariable('--color-ink-3');
  const ink = useCSSVariable('--color-ink');
  return (
    <View className={cn('gap-2', className)}>
      {label ? (
        <Text variant="sm" bold nativeID={rest.nativeID ? `${rest.nativeID}-label` : undefined}>
          {label}
        </Text>
      ) : null}
      <View
        className={cn(
          'min-h-[52px] rounded-card bg-surface px-4 flex-row items-center gap-2.5',
          error ? 'border-2 border-danger' : focus ? 'border-2 border-you' : 'border-[1.5px] border-control-off',
        )}
      >
        {icon ? <Icon name={icon} size={20} color="ink-3" /> : null}
        <TextInput
          accessibilityLabel={rest.accessibilityLabel ?? label}
          placeholderTextColor={String(placeholder ?? '#6E6A62')}
          className="flex-1 min-h-12 text-base font-ui"
          style={{ color: String(ink ?? '#161F2A') }}
          onFocus={(e) => {
            setFocus(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocus(false);
            onBlur?.(e);
          }}
          {...rest}
        />
      </View>
      {error ? (
        <Text variant="sm" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="sm" tone="ink2">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Six boxes for the e-mail code. One hidden TextInput behind them: paste and the
 *  phone's "code from mail" autofill work like in any normal field. */
export function CodeInput({ value, onChange, length = 6, error }: { value: string; onChange: (v: string) => void; length?: number; error?: boolean }) {
  const ref = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [focus, setFocus] = useState(true);
  // Box width from the measured row: flex-1 alone left the boxes 0 wide on some layouts
  const [rowW, setRowW] = useState(0);
  const gap = 8;
  const boxW = rowW ? Math.min(52, (rowW - gap * (length - 1)) / length) : 44;
  return (
    <Pressable onPress={() => ref.current?.focus()} accessible={false} className="self-stretch">
      <View
        className="flex-row"
        style={{ gap }}
        onLayout={(e) => setRowW(e.nativeEvent.layout.width)}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {Array.from({ length }, (_, i) => {
          const ch = value[i] ?? '';
          const cur = focus && i === Math.min(value.length, length - 1);
          return (
            <View
              key={i}
              style={{ width: boxW }}
              className={cn(
                'h-[62px] rounded-card bg-surface items-center justify-center',
                error ? 'border-2 border-danger' : cur ? 'border-[2.5px] border-you' : ch ? 'border-[1.5px] border-ink' : 'border-[1.5px] border-control-off',
              )}
            >
              <Text bold style={{ fontSize: 28, lineHeight: 34 }}>
                {ch}
              </Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus
        maxLength={length}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        accessibilityLabel={`Code, ${length}`}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.011, color: 'transparent' }}
        caretHidden
      />
    </Pressable>
  );
}

/** iOS-style switch in brand colors */
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const [on, off] = useCSSVariable(['--color-you', '--color-control-off']);
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      accessibilityLabel={label}
      trackColor={{ true: String(on ?? '#2E5BFF'), false: String(off ?? '#8A857B') }}
      thumbColor="#FFFFFF"
      ios_backgroundColor={String(off ?? '#8A857B')}
    />
  );
}
