import type { CapabilityManifest } from '../model/capability.js';
import type { SkillDescriptor } from './load-catalog.js';

export function routeSkills(manifest: CapabilityManifest, catalog: SkillDescriptor[]): SkillDescriptor[] {
  const artifacts = new Set(manifest.artifacts.map((item) => item.value));
  const capabilities = new Set(manifest.capabilities.map((item) => item.value));

  return catalog.filter((skill) => {
    const anyArtifacts = skill.appliesTo?.anyArtifacts;
    const allCapabilities = skill.appliesTo?.allCapabilities;
    const artifactMatch = !anyArtifacts?.length || anyArtifacts.some((artifact) => artifacts.has(artifact));
    const capabilityMatch = !allCapabilities?.length || allCapabilities.every((capability) => capabilities.has(capability));
    return artifactMatch && capabilityMatch;
  });
}
