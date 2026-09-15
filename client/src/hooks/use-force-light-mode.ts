import { useLayoutEffect } from "react";
import { useTheme } from "@/components/theme-provider";

// Forces light mode for as long as the calling component is mounted (when
// enabled), without touching the user's actual stored theme preference.
// Goes through ThemeProvider (the only thing that writes the DOM class) so
// this can never be clobbered by its mount-time effect running afterwards.
export function useForceLightMode(enabled = true) {
  const { registerForceLight } = useTheme();

  useLayoutEffect(() => {
    if (!enabled) return;
    return registerForceLight();
  }, [enabled, registerForceLight]);
}
