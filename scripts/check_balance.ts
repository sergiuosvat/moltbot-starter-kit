/**
 * Query account EGLD (+ ESDT) balance via getBalance skill.
 *
 * Usage: npx ts-node scripts/check_balance.ts
 */
import {CONFIG} from '../src/config';
import {getBalance} from '../src/skills/discovery_skills';

async function main() {
  try {
    const result = await getBalance();
    const balanceEgld = BigInt(result.egld) / 1_000_000_000_000_000_000n;

    console.log(`\n🔍 Checking Balance for: ${result.address}`);
    console.log(`🌍 Network: ${CONFIG.API_URL}`);
    console.log(`💰 Balance: ${balanceEgld.toString()} EGLD`);
    console.log(`🔢 Nonce: ${result.nonce}`);

    if (result.tokens.length > 0) {
      console.log(`🪙 Tokens (${result.tokens.length}):`);
      for (const token of result.tokens) {
        console.log(`   - ${token.name || token.identifier}: ${token.balance}`);
      }
    }
  } catch (error) {
    console.error('Error checking balance:', (error as Error).message);
    process.exit(1);
  }
}

void main();
