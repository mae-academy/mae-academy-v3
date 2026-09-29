/**
 * PrefetchLink: Drop-in replacement for wouter's <Link> that triggers a
 * non-blocking route chunk prefetch on mouseEnter/focus. This eliminates
 * the "flash of loader" when navigating between lazy-loaded pages.
 *
 * Usage:
 *   <PrefetchLink href="/research">Research</PrefetchLink>
 *
 * Renders a standard wouter <Link> with added prefetch behaviour.
 */
import { Link } from "wouter";
import { prefetchRoute } from "@/lib/routePrefetch";
import type { ComponentProps } from "react";

export default function PrefetchLink({ href, children, onMouseEnter, onFocus, ...rest }: any) {
  const handlePrefetch = () => {
    if (typeof href === "string") prefetchRoute(href);
  };

  return (
    <Link
      href={href}
      onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
        handlePrefetch();
        if (typeof onMouseEnter === "function") (onMouseEnter as (e: React.MouseEvent<HTMLAnchorElement>) => void)(e);
      }}
      onFocus={(e: React.FocusEvent<HTMLAnchorElement>) => {
        handlePrefetch();
        if (typeof onFocus === "function") (onFocus as (e: React.FocusEvent<HTMLAnchorElement>) => void)(e);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
