/**
 * Build Agent Registration Manifest (registration-v1 JSON)
 *
 * Reads manifest.config.json and generates a complete MX-8004 registration
 * manifest via buildManifest (includes OASF taxonomy validation).
 *
 * Usage: npx ts-node scripts/build_manifest.ts
 * Output: manifest.json in the project root
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  buildManifest,
  type ManifestConfig,
  type ManifestService,
} from '../src/skills/manifest_skills';

interface FileConfig {
  agentName?: string;
  description?: string;
  image?: string;
  version?: string;
  services?: ManifestService[];
  oasf?: {
    skills?: ManifestConfig['skills'];
    domains?: ManifestConfig['domains'];
  };
  contact?: ManifestConfig['contact'];
  x402Support?: boolean;
}

async function main(): Promise<void> {
  console.log('📋 Building Agent Registration Manifest...\n');

  const configPath = path.resolve('manifest.config.json');
  let fileConfig: FileConfig;

  try {
    const raw = await fs.readFile(configPath, 'utf8');
    fileConfig = JSON.parse(raw) as FileConfig;
  } catch {
    console.error(
      '❌ Could not read manifest.config.json. Create one with agent details.',
    );
    console.error(
      '   See: manifest.config.example.json for the expected format.',
    );
    process.exit(1);
  }

  if (!fileConfig.agentName) {
    console.error('❌ manifest.config.json must have an "agentName" field.');
    process.exit(1);
  }

  const skillConfig: ManifestConfig = {
    name: fileConfig.agentName,
    description:
      fileConfig.description || `${fileConfig.agentName} — MultiversX Agent`,
    image: fileConfig.image,
    version: fileConfig.version,
    services: fileConfig.services,
    skills: fileConfig.oasf?.skills,
    domains: fileConfig.oasf?.domains,
    contact: fileConfig.contact,
    x402Support: fileConfig.x402Support,
  };

  let manifest;
  try {
    manifest = buildManifest(skillConfig);
  } catch (err) {
    console.error(`❌ ${(err as Error).message}`);
    process.exit(1);
  }

  const warnings: string[] = [];

  if (manifest.services.length === 0) {
    warnings.push(
      'No services declared. Add at least one service (MCP, A2A, ACP, x402, UCP).',
    );
  }

  if (manifest.oasf.skills.length === 0) {
    warnings.push(
      'No OASF skills declared. Agents without skills are less discoverable.',
    );
  }

  if (manifest.oasf.domains.length === 0) {
    warnings.push(
      'No OASF domains declared. Consider adding at least one domain.',
    );
  }

  const validServiceNames = ['MCP', 'A2A', 'ACP', 'x402', 'UCP'];
  for (const svc of manifest.services) {
    if (!validServiceNames.includes(svc.name)) {
      warnings.push(
        `Unknown service name "${svc.name}". Valid: ${validServiceNames.join(', ')}`,
      );
    }
    if (!svc.endpoint) {
      warnings.push(`Service "${svc.name}" has no endpoint.`);
    }
    if (svc.offerings) {
      for (const offering of svc.offerings) {
        if (!offering.name) {
          warnings.push(
            `Service "${svc.name}" has an offering with serviceId ${offering.serviceId} but no name.`,
          );
        }
        if (!offering.description) {
          warnings.push(
            `Service "${svc.name}" offering "${offering.name || offering.serviceId}" has no description.`,
          );
        }
      }
    }
  }

  const hasOfferings = manifest.services.some(
    svc => svc.offerings && svc.offerings.length > 0,
  );
  if (!hasOfferings) {
    warnings.push(
      'No service offerings declared. Consider adding offerings to describe what each on-chain service provides. See: https://github.com/sasurobert/mx-8004/blob/master/docs/specification.md#74-relationship-offerings-vs-on-chain-services',
    );
  }

  const outputPath = path.resolve('manifest.json');
  await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2), 'utf8');

  const totalOfferings = manifest.services.reduce(
    (sum, svc) => sum + (svc.offerings?.length ?? 0),
    0,
  );

  console.log(`✅ Manifest written to ${outputPath}`);
  console.log(`   Name: ${manifest.name}`);
  console.log(`   Version: ${manifest.version}`);
  console.log(
    `   Services: ${manifest.services.map(s => s.name).join(', ') || 'none'}`,
  );
  console.log(`   Offerings: ${totalOfferings}`);
  console.log(`   Skills: ${manifest.oasf.skills.length} categories`);
  console.log(`   Domains: ${manifest.oasf.domains.length} categories`);
  console.log(`   x402 Support: ${manifest.x402Support}`);

  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    for (const w of warnings) {
      console.log(`   - ${w}`);
    }
  }

  console.log(
    '\n📌 Next: Pin to IPFS with: npx ts-node scripts/pin_manifest.ts',
  );
}

main().catch(err => {
  console.error('❌ Failed to build manifest:', err);
  process.exit(1);
});
