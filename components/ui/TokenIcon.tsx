import { Image } from "react-native";

interface Props {
  size?: number;
}

export function TokenIcon({ size = 24 }: Props) {
  return (
    <Image
      source={require("../../assets/images/token.png")}
      style={{ width: size, height: size }}
    />
  );
}
