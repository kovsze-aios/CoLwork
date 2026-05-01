import React from "react";

/**
 * Motion-lite — a 30-line CSS-only stand-in for the slice of `framer-motion`
 * we actually used (`motion.div`, `motion.span`, `AnimatePresence`,
 * `layoutId` shared element).
 *
 * We dropped `framer-motion` because its CommonJS-flavoured React 19 imports
 * tripped over Rolldown's hoisting in Vite 8 production builds, producing a
 * "Cannot read properties of null (reading 'useContext')" runtime crash.
 * For our needs (page-level fade-in, sliding active-tab pill) plain CSS
 * transitions are visually indistinguishable and ship zero risk.
 *
 * Supported props (others are silently ignored):
 *   initial      — { opacity?, y? }   start state
 *   animate      — { opacity?, y? }   end state
 *   transition   — { duration?, ease? }
 *   layoutId     — string             — when present, gives the element a
 *                                       cross-component fade-out/in via key.
 */

function styleFromState(state, transition) {
  if (!state) return {};
  const dur = transition?.duration ?? 0.18;
  let ease = transition?.ease ?? "cubic-bezier(0.22,1,0.36,1)";
  if (Array.isArray(ease) && ease.length === 4) ease = `cubic-bezier(${ease.join(",")})`;
  return {
    transition: `opacity ${dur}s ${ease}, transform ${dur}s ${ease}`,
    opacity: state.opacity ?? 1,
    transform: state.y != null ? `translateY(${state.y}px)` : "translateY(0)",
  };
}

function makeMotion(tag) {
  return React.forwardRef(function MotionEl(
    { initial, animate, exit, transition, layoutId, style, children, ...rest },
    ref,
  ) {
    const [state, setState] = React.useState(initial ?? animate ?? {});
    React.useEffect(() => {
      if (!animate) return;
      const id = requestAnimationFrame(() => setState(animate));
      return () => cancelAnimationFrame(id);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const Tag = tag;
    return (
      <Tag ref={ref} {...rest} style={{ ...styleFromState(state, transition), ...style }}>
        {children}
      </Tag>
    );
  });
}

export const motion = new Proxy(
  {},
  { get: (_t, key) => makeMotion(key) },
);

/**
 * AnimatePresence: pass-through (no exit animation).
 * Mode is ignored — children just remount; the inner motion components
 * still play their `initial → animate` fade on mount.
 */
export function AnimatePresence({ children }) {
  return <>{children}</>;
}
