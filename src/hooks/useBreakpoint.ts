import { useState, useEffect } from "react";

const BREAKPOINTS = {
  mobile: 768,   // < 768px
  tablet: 1024,  // 768–1023px
} as const;

interface BreakpointState {
  width: number;
  isMobile: boolean;   // < 768px
  isTablet: boolean;   // 768–1023px
  isDesktop: boolean;  // >= 1024px
}

function getState(width: number): BreakpointState {
  return {
    width,
    isMobile: width < BREAKPOINTS.mobile,
    isTablet: width >= BREAKPOINTS.mobile && width < BREAKPOINTS.tablet,
    isDesktop: width >= BREAKPOINTS.tablet,
  };
}

export function useBreakpoint(): BreakpointState {
  const [state, setState] = useState<BreakpointState>(() =>
    getState(typeof window !== "undefined" ? window.innerWidth : 1280)
  );

  useEffect(() => {
    const update = () => setState(getState(window.innerWidth));

    // ResizeObserver on documentElement catches font-size zoom changes too
    const ro = new ResizeObserver(update);
    ro.observe(document.documentElement);

    return () => ro.disconnect();
  }, []);

  return state;
}
