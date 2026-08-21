import { extname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createOperationsCheck } from './create-check.js';
import type { EvidenceRequirement } from './types.js';

type StructuredRecord = Record<string, unknown>;

function testPattern(pattern: RegExp, value: string): boolean {
  return new RegExp(pattern.source, pattern.flags).test(value);
}

function normalizedFieldName(name: string): string {
  return name.replace(/[\s_-]/gu, '').toLowerCase();
}

function isStructuredRecord(value: unknown): value is StructuredRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scalarValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(scalarValues);
  return [];
}

function valuesForStructuredFields(value: unknown, fields: ReadonlySet<string>): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => valuesForStructuredFields(item, fields));
  if (!isStructuredRecord(value)) return [];

  return Object.entries(value).flatMap(([key, fieldValue]) => [
    ...(fields.has(normalizedFieldName(key)) ? scalarValues(fieldValue) : []),
    ...valuesForStructuredFields(fieldValue, fields),
  ]);
}

function tomlFieldValues(content: string, fields: ReadonlySet<string>): string[] {
  const lines = content.split(/\r?\n/u);
  const values: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const field = line?.match(/^[\t ]*([A-Za-z0-9_-]+)[\t ]*=[\t ]*(.*)$/u);
    if (!field || !fields.has(normalizedFieldName(field[1]!))) continue;

    let value = field[2] ?? '';
    if (!value.trimStart().startsWith('[')) {
      values.push(value);
      continue;
    }

    let depth = (value.match(/\[/gu) ?? []).length - (value.match(/\]/gu) ?? []).length;
    while (depth > 0 && index + 1 < lines.length) {
      const next = lines[index + 1] ?? '';
      if (/^[\t ]*[A-Za-z0-9_-]+[\t ]*=/u.test(next) || /^[\t ]*\[[^\]]+\][\t ]*$/u.test(next)) break;
      index += 1;
      value += `\n${next}`;
      depth += (next.match(/\[/gu) ?? []).length - (next.match(/\]/gu) ?? []).length;
    }
    if (depth === 0) values.push(value);
  }

  return values;
}

function structuredFieldValues(content: string, location: string, fieldNames: readonly string[]): string[] {
  const fields = new Set(fieldNames.map(normalizedFieldName));
  const extension = extname(location).toLowerCase();

  try {
    if (extension === '.json') return valuesForStructuredFields(JSON.parse(content), fields);
    if (extension === '.yaml' || extension === '.yml') return valuesForStructuredFields(parseYaml(content), fields);
    if (extension === '.toml') return tomlFieldValues(content, fields);
  } catch {
    return [];
  }

  return [];
}

function structuredFieldMatcher(fieldNames: readonly string[], pattern: RegExp): (content: string, location: string) => boolean {
  return (content, location) => structuredFieldValues(content, location, fieldNames)
    .some((value) => testPattern(pattern, value));
}

const monitoredSignal = /\b(?:application errors?|failed requests?|crash(?: reports?|[- ]reporting)|exceptions?|latency|availability)\b/iu;
const monitoringDestination = /\b(?:grafana|monitoring[\t ]+dashboard|crash[- ]reporting[\t ]+dashboard|observability[\t ]+(?:dashboard|console)|alert[\t ]+service)\b/iu;
const notificationExpectation = /\b(?:review(?:ed|s)?|notify|page|acknowledge(?:d|s)?)[\t ]+[^\r\n.!?]{0,100}\balerts?\b[^\r\n.!?]{0,100}\b(?:within[\t ]+\d+[\t ]+(?:minutes?|hours?)|promptly|immediately)\b/iu;
const firstResponseAction = /\b(?:triage|investigate|assess|capture|escalate|mitigate|follow|disable|rollback|roll back|notify|page)\b[^\r\n]*\b(?:alerts?|failures?|incidents?)\b/iu;
const responsibleOwner = /\b(?:sre|maintainer|team|lead|owner|on-call|engineer|operator|responder|support)\b/iu;

const monitoringRequirements: readonly EvidenceRequirement[] = [
  {
    id: 'signals',
    textOnlyPatterns: true,
    patterns: [
      /^[\t ]*(?:signals?|observed (?:signals?|failures)|failure types?)[\t ]*:[\t ]*[^\r\n]*\b(?:application errors?|failed requests?|crash(?: reports?|[- ]reporting)|exceptions?|latency|availability)\b[^\r\n]*$/imu,
      /\balerts?[\t ]+for[\t ]+[^\r\n.!?]{0,120}\b(?:application errors?|failed requests?|crash(?: reports?|[- ]reporting)|exceptions?|latency|availability)\b/iu,
    ],
    matches: structuredFieldMatcher(['signals', 'observedSignals', 'observedFailures', 'failureTypes'], monitoredSignal),
  },
  {
    id: 'review-location',
    textOnlyPatterns: true,
    patterns: [
      /^[\t ]*(?:review location|review (?:in|at)|monitoring location)[\t ]*:[\t ]*[^\r\n]*\b(?:monitoring|crash[- ]reporting|observability|alert)[\t ]+(?:dashboard|console|service)\b[^\r\n]*$/imu,
      /\b(?:alerts?|signals?|failures?)[\t ]+[^\r\n.!?]{0,120}\breview(?:ed|s)?[\t ]+(?:in|on|through|using)[\t ]+(?:Grafana|[^\r\n.!?]{0,80}\b(?:dashboard|console)\b)/iu,
    ],
    matches: structuredFieldMatcher(['reviewLocation', 'monitoringLocation'], monitoringDestination),
  },
  {
    id: 'notification-expectation',
    textOnlyPatterns: true,
    patterns: [
      /^[\t ]*(?:notification expectation|notification|alerting)[\t ]*:[\t ]*[^\r\n]*\b(?:alert|notify|review)\w*[^\r\n]*\b(?:maintainer|on-call|owner|promptly|within|immediately)\b[^\r\n]*$/imu,
      /\balerts?\b[^\r\n.!?]{0,160}\b(?:review(?:ed|s)?|notify|page|acknowledge(?:d|s)?)\b[^\r\n.!?]{0,160}\b(?:within[\t ]+\d+[\t ]+(?:minutes?|hours?)|promptly|immediately)\b/iu,
    ],
    matches: structuredFieldMatcher(['notificationExpectation', 'notification', 'alerting'], notificationExpectation),
  },
  {
    id: 'first-response',
    textOnlyPatterns: true,
    patterns: [
      /^[\t ]*(?:\d+[.)]|[-*])[\t ]+(?:triage|investigate|assess|capture|escalate|mitigate|follow|disable|rollback|roll back|notify|page)\b[^\r\n]*$/imu,
      /\b(?:triage(?:s|d)?|investigate(?:s|d)?|assess(?:es|ed)?|capture(?:s|d)?|escalate(?:s|d)?|mitigate(?:s|d)?)\b[^\r\n.!?]{0,120}\b(?:alerts?|failures?|incidents?)\b[^\r\n.!?]{0,80}\b(?:first|initially)\b/iu,
    ],
    matches: structuredFieldMatcher(['firstResponse', 'initialResponse'], firstResponseAction),
  },
  {
    id: 'owner',
    textOnlyPatterns: true,
    patterns: [
      /^[\t ]*(?:owner|responsible(?: role)?|incident owner)[\t ]*:[\t ]*(?!tbd\b|todo\b|unknown\b|n\/a\b)[^\r\n]*(?:\b(?:maintainer|team|lead|owner|on-call|engineer|operator|responder|support)\b|(?:[A-Z][a-z]+[\t ]+){1,3}[A-Z][a-z]+)[^\r\n]*$/imu,
      /\b(?:review(?:ed|s)?|own(?:ed|s)?|handle(?:d|s)?|triage(?:d|s)?)\b[^\r\n.!?]{0,160}\bby[\t ]+(?:the[\t ]+)?\b(?:SRE|maintainers?|on-call|[A-Z][a-z]+[\t ]+[A-Z][a-z]+)\b/iu,
    ],
    matches: structuredFieldMatcher(['owner', 'responsibleRole', 'incidentOwner'], responsibleOwner),
  },
];

export const monitoringResponseCheck = createOperationsCheck({
  id: 'launch-operations.monitoring-response',
  label: 'Monitoring and incident response',
  domains: ['operations-observability'],
  actionLevel: 'resolve-before-launch',
  profile: () => ({
    candidatePaths: [
      /(?:^|\/)[^/]*(?:monitoring|incident|crash|operations?|runbooks?)[^/]*\.(?:md|mdx|txt|json|ya?ml|toml)$/iu,
    ],
    requirements: monitoringRequirements,
    riskPatterns: [],
  }),
  recommendation: 'Document observed signals, the review location, notification expectations, first response steps, and ownership.',
  verification: 'Review the documented monitoring and incident response procedure with the responsible maintainer and test live behavior separately.',
  liveBoundary: 'No provider was queried and no alert delivery or response was tested.',
});
