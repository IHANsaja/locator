"use client";

import dynamic from "next/dynamic";

// Client-only: Mapbox needs the DOM, and the location hook reads `window`
// while rendering.
const Locator = dynamic(() => import("@/components/Locator"), {
  ssr: false,
  loading: () => <div className="h-dvh w-full bg-zinc-200 dark:bg-zinc-900" />,
});

export function LocatorClient() {
  return <Locator />;
}
