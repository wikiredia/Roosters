import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';

/** Line icons from the Claude Design boards: 24 grid, 1.5 stroke, round caps. Never emoji. */
const paths = {
  sun: (
    <>
      <Circle cx={12} cy={12} r={4} />
      <Path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>
  ),
  calendar: (
    <>
      <Rect x={3.5} y={5} width={17} height={15.5} rx={2} />
      <Path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </>
  ),
  chat: <Path d="M7.5 17.5 4 20.5V6a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 6v10a1.5 1.5 0 0 1-1.5 1.5z" />,
  user: (
    <>
      <Circle cx={12} cy={8.5} r={4} />
      <Path d="M4.5 20c1.3-3.4 4.1-5 7.5-5s6.2 1.6 7.5 5" />
    </>
  ),
  together: <Path d="M4.5 9.5h11.5v4.5a5 5 0 0 1-5 5h-1.5a5 5 0 0 1-5-5zM16 11h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5v3M12 3.5v3" />,
  back: <Path d="m15 5-7 7 7 7" />,
  undo: <Path d="M9 14.5 4.5 10 9 5.5M4.5 10H15a5 5 0 0 1 0 10h-3" />,
  coffee: <Path d="M5.5 10h10v4a4.5 4.5 0 0 1-4.5 4.5h-1A4.5 4.5 0 0 1 5.5 14zM15.5 11.5h1a2.25 2.25 0 0 1 0 4.5h-1M9 3.5c-.8.8-.8 1.7 0 2.5M12.5 3.5c-.8.8-.8 1.7 0 2.5M4 21h13" />,
  forward: <Path d="m9 5 7 7-7 7" />,
  down: <Path d="m5 9 7 7 7-7" />,
  close: <Path d="M6 6l12 12M18 6 6 18" />,
  plus: <Path d="M12 5v14M5 12h14" />,
  minus: <Path d="M6 12h12" />,
  check: <Path d="m5 12.5 4.5 4.5L19 7.5" />,
  clock: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 7.5V12l3 2" />
    </>
  ),
  search: (
    <>
      <Circle cx={11} cy={11} r={6.5} />
      <Path d="m16 16 4 4" />
    </>
  ),
  zoomOut: (
    <>
      <Circle cx={11} cy={11} r={6.5} />
      <Path d="m16 16 4 4M8 11h6" />
    </>
  ),
  mail: (
    <>
      <Rect x={3.5} y={5.5} width={17} height={13} rx={2} />
      <Path d="m4 6.5 8 6 8-6" />
    </>
  ),
  pin: (
    <>
      <Path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <Circle cx={12} cy={10} r={2.3} />
    </>
  ),
  copy: (
    <>
      <Rect x={8.5} y={8.5} width={11.5} height={11.5} rx={1.5} />
      <Path d="M15.5 8.5V5.5A1.5 1.5 0 0 0 14 4H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5h3" />
    </>
  ),
  share: <Path d="M12 3.5v11M8 7.5l4-4 4 4M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" />,
  swap: <Path d="M7 4 3.5 7.5 7 11M3.5 7.5h13M17 13l3.5 3.5L17 20M20.5 16.5h-13" />,
  arrow: <Path d="M5 12h14M13 6l6 6-6 6" />,
  ghost: (
    <>
      <Path d="M6 20.5V10a6 6 0 0 1 12 0v10.5l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z" />
      <Circle cx={9.5} cy={10.5} r={0.6} />
      <Circle cx={14.5} cy={10.5} r={0.6} />
    </>
  ),
  users: (
    <>
      <Circle cx={9} cy={8.5} r={3.5} />
      <Path d="M3 19.5c1-3 3.3-4.5 6-4.5s5 1.5 6 4.5M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 15.3c1.6.6 2.8 2 3.5 4.2" />
    </>
  ),
  link: <Path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  globe: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5s1.2-6.1 3.5-8.5z" />
    </>
  ),
  bell: (
    <>
      <Path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
      <Path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  shield: <Path d="M12 3.5 5 6v5.5c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6z" />,
  download: <Path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />,
  logout: <Path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14M10 12h10M16.5 8.5 20 12l-3.5 3.5" />,
  trash: <Path d="M5 7h14M10 4h4M7 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7M10 11v6M14 11v6" />,
  refresh: <Path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />,
  wifi: <Path d="M3 9a13 13 0 0 1 18 0M6 12.5a8.5 8.5 0 0 1 12 0M9 16a4 4 0 0 1 6 0M12 19.5h.01" />,
  wifiOff: <Path d="M3 9a13 13 0 0 1 18 0M6 12.5a8.5 8.5 0 0 1 12 0M9 16a4 4 0 0 1 6 0M12 19.5h.01M4 4l16 16" />,
  qr: (
    <>
      <Rect x={4} y={4} width={6} height={6} rx={1} />
      <Rect x={14} y={4} width={6} height={6} rx={1} />
      <Rect x={4} y={14} width={6} height={6} rx={1} />
      <Path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" />
    </>
  ),
  edit: <Path d="M14.5 5.5 18.5 9.5M4.5 19.5l1-4L15 6a2 2 0 0 1 3 3l-9.5 9.5z" />,
  crown: <Path d="M3 8.5l4.5 3.5L12 5l4.5 7L21 8.5 19 18H5z" />,
} as const;

export type IconName = keyof typeof paths;

type Props = {
  name: IconName;
  size?: number;
  /** A color value, or a token name like "ink-2" */
  color?: string;
  strokeWidth?: number;
};

export function Icon({ name, size = 24, color = 'ink', strokeWidth = 1.5 }: Props) {
  const token = useCSSVariable(`--color-${color}`);
  const stroke = color.startsWith('#') || color.startsWith('rgb') ? color : String(token ?? '#161F2A');
  const filled = name === 'crown';
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? stroke : 'none'}
      stroke={filled ? 'none' : stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {paths[name]}
    </Svg>
  );
}
