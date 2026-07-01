import posthog from "posthog-js";
import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import { useLocation, useNavigationType, createRoutesFromChildren, matchRoutes } from "react-router-dom";

type EventProps = Record<string, string | number | boolean | null | undefined>;

const ENABLE_ANALYTICS = (import.meta.env.VITE_ENABLE_ANALYTICS ?? "false").toString().toLowerCase() === "true";
const POSTHOG_KEY = (import.meta.env.VITE_POSTHOG_KEY ?? "").trim();
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com").trim();
const SENTRY_DSN = (import.meta.env.VITE_SENTRY_DSN ?? "").trim();
const SENTRY_TRACES_SAMPLE_RATE = Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? "0.1");
const SENTRY_ENABLE_LOGS = (import.meta.env.VITE_SENTRY_ENABLE_LOGS ?? "true").toString().toLowerCase() === "true";

let initialized = false;
let sentryInitialized = false;

export function initAnalytics(): void {
  if (initialized || !ENABLE_ANALYTICS || !POSTHOG_KEY) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    person_profiles: "identified_only",
  });
  initialized = true;
}

export function initSentry(): void {
  if (sentryInitialized || !SENTRY_DSN) return;
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.reactRouterBrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      Sentry.consoleLoggingIntegration(),
    ],
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    tracePropagationTargets: ["localhost", "192.168.0.20:8000", /^https:\/\/dashboard\.local\/api/],
    enableLogs: SENTRY_ENABLE_LOGS,
  });
  sentryInitialized = true;
}

export function captureError(error: Error, context?: Record<string, unknown>): void {
  if (!sentryInitialized) return;
  Sentry.captureException(error, { extra: context });
}

export function logEvent(level: "trace" | "debug" | "info" | "warn" | "error" | "fatal", message: string, attributes?: EventProps): void {
  if (!sentryInitialized) return;
  Sentry.logger[level](message, attributes);
}

export function trackEvent(eventName: string, props: EventProps = {}): void {
  if (!initialized) return;
  posthog.capture(eventName, props);
}

export function trackPageView(pathname: string): void {
  trackEvent("page_view", { pathname });
}

export function trackApiMetric(params: {
  endpoint: string;
  method: string;
  statusCode?: number;
  durationMs: number;
  ok: boolean;
}): void {
  const endpointPath = params.endpoint.split("?")[0];
  const endpointGroup = endpointPath.split("/").filter(Boolean)[1] ?? "root";
  trackEvent("api_request", {
    endpoint_group: endpointGroup,
    method: params.method,
    status_code: params.statusCode ?? 0,
    status_class: params.statusCode ? `${Math.floor(params.statusCode / 100)}xx` : "network_error",
    duration_ms: Math.round(params.durationMs),
    ok: params.ok,
  });
}
