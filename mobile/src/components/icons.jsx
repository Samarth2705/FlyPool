// Small outline icons, drawn with the same SVG paths as the web app
// (client/src/components/ui/icons.jsx), so both apps look alike.
//   <CheckIcon size={16} color={colors.success} />
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from '../theme';

function Icon({ size = 20, color, strokeWidth = 1.8, children }) {
  const { colors } = useTheme();
  color = color ?? colors.text;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
    >
      {children}
    </Svg>
  );
}

export function CheckIcon(props) {
  return (
    <Icon strokeWidth={2.4} {...props}>
      <Path d="M5 12.5l4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function AlertIcon(props) {
  return (
    <Icon {...props}>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M12 7.5v5.5M12 16.5h.01" />
    </Icon>
  );
}

export function UsersIcon(props) {
  return (
    <Icon {...props}>
      <Circle cx="9" cy="8" r="3.5" />
      <Path d="M2.5 20c1-3.2 3.5-4.8 6.5-4.8s5.5 1.6 6.5 4.8M16 4.6a3.5 3.5 0 0 1 0 6.8M18 15.4c1.8.6 3 2 3.5 4.6" />
    </Icon>
  );
}

export function ShieldIcon(props) {
  return (
    <Icon {...props}>
      <Path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6Z" />
      <Path d="M9 12l2 2 4-4" />
    </Icon>
  );
}

export function PlaneIcon(props) {
  return (
    <Icon {...props}>
      <Path d="M10.5 13.5 3 11l1.5-1.5 7.5 1L16.5 6c1-1 2.6-1.4 3.2-.7.7.6.3 2.2-.7 3.2l-4.5 4.5 1 7.5L14 22l-2.5-7.5-3 3V20l-1.5 1-1-3-3-1L4 15.5h2.5Z" />
    </Icon>
  );
}

// The filled plane used in the logo (Material "flight")
export const PLANE_SOLID_PATH =
  'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';

export function FileIcon(props) {
  return (
    <Icon {...props}>
      <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <Path d="M14 3v5h5M9 13h6M9 17h4" />
    </Icon>
  );
}

export function CameraIcon(props) {
  return (
    <Icon {...props}>
      <Path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <Circle cx="12" cy="12.5" r="3.5" />
    </Icon>
  );
}

export function UploadIcon(props) {
  return (
    <Icon {...props}>
      <Path d="M12 16V4M7 9l5-5 5 5" />
      <Path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </Icon>
  );
}

export function MapPinIcon(props) {
  return (
    <Icon {...props}>
      <Path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
      <Circle cx="12" cy="9.5" r="2.5" />
    </Icon>
  );
}

export function SearchIcon(props) {
  return (
    <Icon {...props}>
      <Circle cx="11" cy="11" r="6.5" />
      <Path d="M20 20l-4.2-4.2" />
    </Icon>
  );
}

export function LockIcon(props) {
  return (
    <Icon {...props}>
      <Rect x="5" y="11" width="14" height="10" rx="2" />
      <Path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Icon>
  );
}

// ---- account menu, My Trips, Settings (same paths as the web's icons) ----

export function UserIcon(props) {
  return (
    <Icon {...props}>
      <Circle cx="12" cy="8" r="4" />
      <Path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
    </Icon>
  );
}

export function TicketIcon(props) {
  return (
    <Icon {...props}>
      <Path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4Z" />
      <Path d="M14 6v12" strokeDasharray="2 2" />
    </Icon>
  );
}

export function SettingsIcon(props) {
  return (
    <Icon {...props}>
      <Path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
      <Circle cx="16" cy="6" r="2" />
      <Circle cx="10" cy="12" r="2" />
      <Circle cx="18" cy="18" r="2" />
    </Icon>
  );
}

export function SunIcon(props) {
  return (
    <Icon {...props}>
      <Circle cx="12" cy="12" r="4" />
      <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  );
}

export function MoonIcon(props) {
  return (
    <Icon {...props}>
      <Path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </Icon>
  );
}

export function MonitorIcon(props) {
  return (
    <Icon {...props}>
      <Rect x="3" y="4" width="18" height="12" rx="2" />
      <Path d="M8 20h8M12 16v4" />
    </Icon>
  );
}

export function LogoutIcon(props) {
  return (
    <Icon {...props}>
      <Path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <Path d="M10 16l-4-4 4-4M6 12h10" />
    </Icon>
  );
}

export function CalendarIcon(props) {
  return (
    <Icon {...props}>
      <Rect x="3" y="5" width="18" height="16" rx="2" />
      <Path d="M3 10h18M8 3v4M16 3v4" />
    </Icon>
  );
}

export function ArrowLeftIcon(props) {
  return (
    <Icon {...props}>
      <Path d="M19 12H5M11 6l-6 6 6 6" />
    </Icon>
  );
}

export function ChevronRightIcon(props) {
  return (
    <Icon {...props}>
      <Path d="M9 6l6 6-6 6" />
    </Icon>
  );
}

// ---- notifications and chat ----

export function BellIcon(props) {
  return (
    <Icon {...props}>
      <Path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4Z" />
      <Path d="M10 20a2 2 0 0 0 4 0" />
    </Icon>
  );
}

export function ChatIcon(props) {
  return (
    <Icon {...props}>
      <Path d="M4 5h16v11H9l-5 4V5Z" />
      <Path d="M8 9.5h8M8 12.5h5" />
    </Icon>
  );
}

export function SendIcon(props) {
  return (
    <Icon {...props}>
      <Path d="M4 12l16-8-6 16-2.5-6.5L4 12Z" />
      <Path d="M11.5 13.5L20 4" />
    </Icon>
  );
}
