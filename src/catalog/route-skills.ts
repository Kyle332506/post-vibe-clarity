import type { CapabilityManifest } from '../model/capability.js';
import type { SkillDescriptor } from './load-catalog.js';

export type SkillMode = SkillDescriptor['modes'][number];

export function routeSkills(
  manifest: CapabilityManifest,
  catalog: SkillDescriptor[],
  mode: SkillMode = 'audit',
): SkillDescriptor[] {
  return catalog.filter((skill) => skill.modes.includes(mode) && matchesManifest(skill, manifest));
}

function matchesManifest(skill: SkillDescriptor, manifest: CapabilityManifest): boolean {
  const artifacts = new Set(manifest.artifacts.map((item) => item.value));
  const capabilities = new Set(manifest.capabilities.map((item) => item.value));

  const anyArtifacts = skill.appliesTo?.anyArtifacts;
  const allCapabilities = skill.appliesTo?.allCapabilities;
  const artifactMatch = !anyArtifacts?.length || anyArtifacts.some((artifact) => artifacts.has(artifact));
  const capabilityMatch = !allCapabilities?.length || allCapabilities.every((capability) => capabilities.has(capability));
  return artifactMatch && capabilityMatch;
}
