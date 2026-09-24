"use client";

import type { ReactNode } from "react";
import { isApiError } from "@/shared/api";
import { Banner, Button } from "./primitives";

interface ErrorNoticeProps {
  error: unknown;
  onRetry?: () => void;
  /** Words for the thing that failed to load, e.g. "incidents". */
  subject?: string;
}

/**
 * Different failures get different states: no data, no permission, stale version,
 * unreachable service and server error must never look alike.
 */
export function ErrorNotice({ error, onRetry, subject = "this information" }: ErrorNoticeProps) {
  const retry = onRetry ? <Button size="small" onClick={onRetry}>Try again</Button> : null;
  if (!isApiError(error)) {
    return (
      <Banner tone="danger" title={`Could not load ${subject}`}>
        <p className="small">{error instanceof Error ? error.message : "Unexpected error"}</p>
        {retry}
      </Banner>
    );
  }
  const ref = error.requestId ? <p className="small muted">Reference: <span className="mono">{error.requestId}</span></p> : null;
  switch (error.kind) {
    case "network":
      return (
        <Banner tone="warn" title="Cannot reach the service">
          <p className="small">This is a connection problem, not an empty result. {subject[0]?.toUpperCase()}{subject.slice(1)} could not be checked. Data shown elsewhere may be out of date.</p>
          {retry}
        </Banner>
      );
    case "unauthenticated":
      return (
        <Banner tone="warn" title="Your session has ended">
          <p className="small"><a href="/login">Sign in again</a> to continue.</p>
        </Banner>
      );
    case "forbidden":
      return (
        <Banner tone="danger" title="Not permitted">
          <p className="small">Your role or scope does not allow access to {subject}. {error.message}</p>
          {ref}
        </Banner>
      );
    case "not_found":
      return (
        <Banner tone="warn" title="Not found">
          <p className="small">This item does not exist or is outside your permitted scope.</p>
          {ref}
        </Banner>
      );
    case "stale_version":
      return (
        <Banner tone="warn" title="Someone else changed this first">
          <p className="small">The record changed since you opened it, so your action was not applied. Reload the current version and review it before trying again.</p>
          {retry}
        </Banner>
      );
    case "stale_route":
      return (
        <Banner tone="warn" title="Route recommendation is outdated">
          <p className="small">Road status changed or the plan expired. Recompute the route before deciding.</p>
        </Banner>
      );
    case "conflict":
      return (
        <Banner tone="warn" title="Conflict">
          <p className="small">{error.message}</p>
          {ref}
        </Banner>
      );
    case "validation":
      return (
        <Banner tone="warn" title="The request was not accepted">
          <p className="small">{error.message}</p>
          {ref}
        </Banner>
      );
    case "rate_limited":
      return (
        <Banner tone="warn" title="Too many requests">
          <p className="small">Wait a moment and try again.</p>
          {retry}
        </Banner>
      );
    default:
      return (
        <Banner tone="danger" title="Service error">
          <p className="small">The service failed while loading {subject}. This is not the same as there being no data. {error.message}</p>
          {ref}
          {retry}
        </Banner>
      );
  }
}

interface QueryLike<T> {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: T | undefined;
  refetch: () => unknown;
}

interface QueryStateProps<T> {
  query: QueryLike<T>;
  subject: string;
  isEmpty?: (data: T) => boolean;
  emptyMessage?: ReactNode;
  children: (data: T) => ReactNode;
}

export function QueryState<T>({ query, subject, isEmpty, emptyMessage, children }: QueryStateProps<T>) {
  if (query.isPending) {
    return (
      <p role="status" className="muted">
        Loading {subject}…
      </p>
    );
  }
  if (query.isError || query.data === undefined) {
    return <ErrorNotice error={query.error} subject={subject} onRetry={() => void query.refetch()} />;
  }
  if (isEmpty?.(query.data)) {
    return <p className="muted">{emptyMessage ?? `No ${subject} found in your scope.`}</p>;
  }
  return <>{children(query.data)}</>;
}

/** Hides children unless the capability check passes; the server still enforces every call. */
export function CapabilityNotice({ what }: { what: string }) {
  return (
    <Banner tone="neutral" title="Not part of your role">
      <p className="small">{what} is not available to your role. This is enforced by the server, not only by hiding menus.</p>
    </Banner>
  );
}
