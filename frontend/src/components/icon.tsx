// Arunika — Ikon (Ionicons dari @react-native-vector-icons).
import Ionicons from "@react-native-vector-icons/ionicons";

import { useTheme } from "@/src/theme";

type Props = {
  name: React.ComponentProps<typeof Ionicons>["name"];
  size?: number;
  color?: string;
};

export function Icon({ name, size = 22, color }: Props) {
  const { colors } = useTheme();
  return <Ionicons name={name} size={size} color={color || colors.onSurface} />;
}

export default Icon;
