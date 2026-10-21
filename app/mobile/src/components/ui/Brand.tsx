import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { Text } from './Text';

/** The app icon, as drawn on the brand board. */
export function AppIcon({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Roosters+">
      <Rect width={100} height={100} rx={22.5} fill="#161F2A" />
      <Rect x={26} y={20} width={22} height={23} rx={5} fill="#2E5BFF" />
      <Rect x={52} y={28} width={22} height={15} rx={5} fill="#F0487A" />
      <Rect x={23} y={46} width={54} height={10} rx={5} fill="#FFC21A" />
      <Rect x={26} y={59} width={22} height={21} rx={5} fill="#2E5BFF" />
      <Rect x={52} y={59} width={22} height={13} rx={5} fill="#F0487A" />
    </Svg>
  );
}

/** "Roosters" in the display font with the yellow plus. */
export function Wordmark({ size = 24 }: { size?: number }) {
  const plus = Math.round(size * 0.58);
  return (
    <View className="flex-row items-start" accessible accessibilityLabel="Roosters+">
      <Text className="font-wordmark text-ink" style={{ fontSize: size, lineHeight: size * 1.15, letterSpacing: -size * 0.02 }}>
        Roosters
      </Text>
      <Svg width={plus} height={plus} viewBox="0 0 24 24" style={{ marginTop: size * 0.08 }}>
        <Rect x={9} y={2} width={6} height={20} rx={3} fill="#FFC21A" />
        <Rect x={2} y={9} width={20} height={6} rx={3} fill="#FFC21A" />
      </Svg>
    </View>
  );
}

/**
 * Placeholder mascot: a rooster built from the icon's blocks. Only on onboarding, empty states,
 * the paywall and success moments. mood: normal, happy (success), sleepy (empty day).
 */
export function Mascot({ size = 120, mood = 'normal' }: { size?: number; mood?: 'normal' | 'happy' | 'sleepy' }) {
  return (
    <Svg width={size} height={(size * 128) / 120} viewBox="0 0 120 128" accessibilityElementsHidden>
      <G>
        <Rect x={45} y={11} width={10} height={21} rx={5} fill="#F0487A" />
        <Rect x={55} y={4} width={11} height={28} rx={5.5} fill="#F0487A" />
        <Rect x={66} y={11} width={10} height={21} rx={5} fill="#F0487A" />
      </G>
      <Rect x={11} y={62} width={17} height={28} rx={8.5} fill="#1D3FD0" />
      <Rect x={92} y={62} width={17} height={28} rx={8.5} fill="#1D3FD0" />
      <Rect x={40} y={102} width={14} height={10} rx={5} fill="#FFC21A" />
      <Rect x={66} y={102} width={14} height={10} rx={5} fill="#FFC21A" />
      <Rect x={22} y={26} width={76} height={80} rx={32} fill="#2E5BFF" />
      <Rect x={38} y={72} width={44} height={28} rx={14} fill="#5B7EFF" />
      {mood === 'normal' ? (
        <>
          <Circle cx={46} cy={54} r={9} fill="#FFFFFF" />
          <Circle cx={48} cy={56} r={5} fill="#161F2A" />
          <Circle cx={50} cy={53.6} r={1.7} fill="#FFFFFF" />
          <Circle cx={74} cy={54} r={9} fill="#FFFFFF" />
          <Circle cx={72} cy={56} r={5} fill="#161F2A" />
          <Circle cx={74} cy={53.6} r={1.7} fill="#FFFFFF" />
        </>
      ) : mood === 'happy' ? (
        <Path d="M38 57q8-11 16 0M66 57q8-11 16 0" stroke="#161F2A" strokeWidth={5} fill="none" strokeLinecap="round" />
      ) : (
        <>
          <Path d="M38 56q8 6 16 0M66 56q8 6 16 0" stroke="#161F2A" strokeWidth={4.5} fill="none" strokeLinecap="round" />
          <Path d="M96 14h9l-9 10h9" stroke="#8A857B" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      <Circle cx={34} cy={70} r={4.5} fill="#F0487A" />
      <Circle cx={86} cy={70} r={4.5} fill="#F0487A" />
      <Rect x={54} y={66} width={12} height={5} rx={2.5} fill="#FFC21A" />
      <Rect x={57.5} y={62.5} width={5} height={12} rx={2.5} fill="#FFC21A" />
    </Svg>
  );
}
