import { extname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createOperationsCheck } from './create-check.js';
import type { EvidenceRequirement } from './types.js';

type StructuredRecord = Record<string, unknown>;

function testPattern(pattern: RegExp, value: string): boolean {
  return new RegExp(pattern.source, pattern.flags).test(value);
}

function fieldAlias(name: string): string {
  return name.toLowerCase();
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

function valuesForTopLevelStructuredFields(value: unknown, fields: ReadonlySet<string>): string[] {
  if (!isStructuredRecord(value)) return [];
  return Object.entries(value).flatMap(([key, fieldValue]) =>
    fields.has(fieldAlias(key)) ? scalarValues(fieldValue) : []);
}

function stripTomlComment(value: string): string | undefined {
  let quote: '"' | "'" | undefined;
  let escaped = false;
  let comment = false;
  let result = '';

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (comment) {
      if (character === '\n') {
        comment = false;
        result += character;
      }
      continue;
    }
    if (quote === '"' && character === '\\' && !escaped) {
      escaped = true;
      result += character;
      continue;
    }
    if (character === quote && !escaped) {
      quote = undefined;
      result += character;
      continue;
    }
    if (!quote && (character === '"' || character === "'")) {
      quote = character;
      result += character;
      continue;
    }
    if (!quote && character === '#') {
      comment = true;
      continue;
    }
    if (quote && character === '\n') return undefined;
    result += character;
    escaped = false;
  }

  return quote ? undefined : result;
}

function parseTomlString(value: string): string[] | undefined {
  const quote = value[0];
  if (quote !== '"' && quote !== "'") return undefined;
  let escaped = false;

  for (let index = 1; index < value.length; index += 1) {
    const character = value[index];
    if (quote === '"' && character === '\\' && !escaped) {
      escaped = true;
      continue;
    }
    if (character === quote && !escaped) {
      return value.slice(index + 1).trim() === '' ? [value.slice(1, index)] : undefined;
    }
    escaped = false;
  }

  return undefined;
}

function parseTomlArray(value: string): string[] | undefined {
  if (!value.startsWith('[')) return undefined;
  const elements: string[] = [];
  let elementStart = 1;
  let quote: '"' | "'" | undefined;
  let escaped = false;
  let depth = 1;

  for (let index = 1; index < value.length; index += 1) {
    const character = value[index];
    if (quote === '"' && character === '\\' && !escaped) {
      escaped = true;
      continue;
    }
    if (character === quote && !escaped) {
      quote = undefined;
      continue;
    }
    if (!quote && (character === '"' || character === "'")) {
      quote = character;
      continue;
    }
    if (!quote && character === '[') {
      depth += 1;
      escaped = false;
      continue;
    }
    if (!quote && character === ']') {
      depth -= 1;
      if (depth < 0) return undefined;
      if (depth > 0) {
        escaped = false;
        continue;
      }
      if (value.slice(index + 1).trim() !== '') return undefined;
      const last = value.slice(elementStart, index).trim();
      if (last) {
        const parsed = parseTomlValue(last);
        if (!parsed) return undefined;
        elements.push(...parsed);
      }
      return elements;
    }
    if (!quote && depth === 1 && character === ',') {
      const parsed = parseTomlValue(value.slice(elementStart, index));
      if (!parsed || parsed.length === 0) return undefined;
      elements.push(...parsed);
      elementStart = index + 1;
      continue;
    }
    escaped = false;
  }

  return undefined;
}

function parseTomlValue(rawValue: string): string[] | undefined {
  const withoutComment = stripTomlComment(rawValue);
  if (withoutComment === undefined) return undefined;
  const value = withoutComment.trim();
  if (!value) return [];
  if (value.startsWith('[')) return parseTomlArray(value);
  if (value.startsWith('"') || value.startsWith("'")) return parseTomlString(value);
  return /^[A-Za-z0-9_.+-]+$/u.test(value) ? [value] : undefined;
}

type TomlArrayState = 'complete' | 'incomplete' | 'invalid';

function tomlArrayState(value: string): TomlArrayState {
  if (!value.trimStart().startsWith('[')) return 'invalid';
  let quote: '"' | "'" | undefined;
  let escaped = false;
  let comment = false;
  let depth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (comment) {
      if (character === '\n') comment = false;
      continue;
    }
    if (quote === '"' && character === '\\' && !escaped) {
      escaped = true;
      continue;
    }
    if (character === quote && !escaped) {
      quote = undefined;
      continue;
    }
    if (!quote && (character === '"' || character === "'")) {
      quote = character;
      continue;
    }
    if (!quote && character === '#') {
      comment = true;
      continue;
    }
    if (quote && character === '\n') return 'invalid';
    if (!quote && character === '[') depth += 1;
    if (!quote && character === ']') {
      depth -= 1;
      if (depth < 0) return 'invalid';
    }
    escaped = false;
  }

  if (quote) return 'invalid';
  return depth === 0 ? 'complete' : 'incomplete';
}

function isTomlTableHeader(value: string): boolean {
  return /^\[\[?[^\]]+\]\]?$/u.test(value);
}

function isTomlAssignment(value: string): boolean {
  return /^[A-Za-z0-9_-]+[\t ]*=/u.test(value);
}

function readTomlTopLevelValue(
  initialValue: string,
  lines: readonly string[],
  initialIndex: number,
): { values: string[] | undefined; nextIndex: number } {
  if (!initialValue.trimStart().startsWith('[')) {
    return { values: parseTomlValue(initialValue), nextIndex: initialIndex };
  }

  let value = initialValue;
  let index = initialIndex;
  let state = tomlArrayState(value);
  while (state === 'incomplete' && index + 1 < lines.length) {
    const next = stripTomlComment(lines[index + 1] ?? '');
    if (next === undefined || isTomlTableHeader(next.trim()) || isTomlAssignment(next.trim())) break;
    index += 1;
    value += `\n${next}`;
    state = tomlArrayState(value);
  }

  return {
    values: state === 'complete' ? parseTomlValue(value) : undefined,
    nextIndex: index,
  };
}

function tomlFieldValues(content: string, fields: ReadonlySet<string>): string[] {
  let insideTable = false;
  const assignments: Array<string[] | undefined> = [];
  const lines = content.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const withoutComment = stripTomlComment(lines[index] ?? '');
    if (withoutComment === undefined) continue;
    const trimmed = withoutComment.trim();
    if (!trimmed) continue;
    if (isTomlTableHeader(trimmed)) {
      insideTable = true;
      continue;
    }
    if (insideTable) continue;

    const field = trimmed.match(/^([A-Za-z0-9_-]+)[\t ]*=[\t ]*(.*)$/u);
    if (!field || !fields.has(fieldAlias(field[1]!))) continue;
    const parsed = readTomlTopLevelValue(field[2] ?? '', lines, index);
    assignments.push(parsed.values);
    index = parsed.nextIndex;
  }

  return assignments.length === 1 ? assignments[0] ?? [] : [];
}

function structuredFieldValues(content: string, location: string, fieldNames: readonly string[]): string[] {
  const fields = new Set(fieldNames.map(fieldAlias));
  const extension = extname(location).toLowerCase();

  try {
    if (extension === '.json') return valuesForTopLevelStructuredFields(JSON.parse(content), fields);
    if (extension === '.yaml' || extension === '.yml') return valuesForTopLevelStructuredFields(parseYaml(content), fields);
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
    matches: structuredFieldMatcher(['signals', 'observedSignals', 'observed_signals', 'observedFailures', 'observed_failures', 'failureTypes', 'failure_types'], monitoredSignal),
  },
  {
    id: 'review-location',
    textOnlyPatterns: true,
    patterns: [
      /^[\t ]*(?:review location|review (?:in|at)|monitoring location)[\t ]*:[\t ]*[^\r\n]*\b(?:monitoring|crash[- ]reporting|observability|alert)[\t ]+(?:dashboard|console|service)\b[^\r\n]*$/imu,
      /\b(?:alerts?|signals?|failures?)[\t ]+[^\r\n.!?]{0,120}\breview(?:ed|s)?[\t ]+(?:in|on|through|using)[\t ]+(?:Grafana|[^\r\n.!?]{0,80}\b(?:dashboard|console)\b)/iu,
    ],
    matches: structuredFieldMatcher(['reviewLocation', 'review_location', 'monitoringLocation', 'monitoring_location'], monitoringDestination),
  },
  {
    id: 'notification-expectation',
    textOnlyPatterns: true,
    patterns: [
      /^[\t ]*(?:notification expectation|notification|alerting)[\t ]*:[\t ]*[^\r\n]*\b(?:alert|notify|review)\w*[^\r\n]*\b(?:maintainer|on-call|owner|promptly|within|immediately)\b[^\r\n]*$/imu,
      /\balerts?\b[^\r\n.!?]{0,160}\b(?:review(?:ed|s)?|notify|page|acknowledge(?:d|s)?)\b[^\r\n.!?]{0,160}\b(?:within[\t ]+\d+[\t ]+(?:minutes?|hours?)|promptly|immediately)\b/iu,
    ],
    matches: structuredFieldMatcher(['notificationExpectation', 'notification_expectation', 'notification', 'alerting'], notificationExpectation),
  },
  {
    id: 'first-response',
    textOnlyPatterns: true,
    patterns: [
      /^[\t ]*(?:\d+[.)]|[-*])[\t ]+(?:triage|investigate|assess|capture|escalate|mitigate|follow|disable|rollback|roll back|notify|page)\b[^\r\n]*$/imu,
      /\b(?:triage(?:s|d)?|investigate(?:s|d)?|assess(?:es|ed)?|capture(?:s|d)?|escalate(?:s|d)?|mitigate(?:s|d)?)\b[^\r\n.!?]{0,120}\b(?:alerts?|failures?|incidents?)\b[^\r\n.!?]{0,80}\b(?:first|initially)\b/iu,
    ],
    matches: structuredFieldMatcher(['firstResponse', 'first_response', 'initialResponse', 'initial_response'], firstResponseAction),
  },
  {
    id: 'owner',
    textOnlyPatterns: true,
    patterns: [
      /^[\t ]*(?:owner|responsible(?: role)?|incident owner)[\t ]*:[\t ]*(?!tbd\b|todo\b|unknown\b|n\/a\b)[^\r\n]*(?:\b(?:maintainer|team|lead|owner|on-call|engineer|operator|responder|support)\b|(?:[A-Z][a-z]+[\t ]+){1,3}[A-Z][a-z]+)[^\r\n]*$/imu,
      /\b(?:review(?:ed|s)?|own(?:ed|s)?|handle(?:d|s)?|triage(?:d|s)?)\b[^\r\n.!?]{0,160}\bby[\t ]+(?:the[\t ]+)?\b(?:SRE|maintainers?|on-call|[A-Z][a-z]+[\t ]+[A-Z][a-z]+)\b/iu,
    ],
    matches: structuredFieldMatcher(['owner', 'responsibleRole', 'responsible_role', 'incidentOwner', 'incident_owner'], responsibleOwner),
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
