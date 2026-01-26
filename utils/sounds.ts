import { Audio } from "expo-av";

const SOUNDS = {
  win: require("../assets/audio/win.wav"),
} as const;

type SoundName = keyof typeof SOUNDS;

export async function playSound(name: SoundName) {
  const { sound } = await Audio.Sound.createAsync(SOUNDS[name]);
  await sound.playAsync();
  sound.setOnPlaybackStatusUpdate((status) => {
    if (status.isLoaded && status.didJustFinish) {
      sound.unloadAsync();
    }
  });
}
