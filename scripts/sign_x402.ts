import {UserSigner} from '@multiversx/sdk-wallet';
import {Transaction, Address, TransactionComputer} from '@multiversx/sdk-core';
import {promises as fs} from 'fs';

// Usage:
//   ts-node sign_x402.ts <pemPath> <receiver> <value> <nonce> <chainID> [data]
//   ts-node sign_x402.ts <pemPath> <receiver> <value> <nonce> <chainID> --relayer <addr> [data]
//
// With --relayer, signs Relayed V3–compatible (relayer field + extra gas).

const BASE_GAS_LIMIT = 500000n;
const RELAYED_V3_EXTRA_GAS = 50000n;
const GAS_PRICE = 1000000000n;

function parseArgs(argv: string[]): {
  positional: string[];
  relayer?: string;
} {
  const positional: string[] = [];
  let relayer: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--relayer') {
      const value = argv[++i];
      if (!value) {
        console.error('Missing value for --relayer');
        process.exit(1);
      }
      relayer = value;
      continue;
    }
    positional.push(arg);
  }

  return {positional, relayer};
}

async function main() {
  const {positional, relayer} = parseArgs(process.argv.slice(2));

  if (positional.length < 5) {
    console.error(
      'Usage: sign_x402.ts <pemPath> <receiver> <value> <nonce> <chainID> [--relayer <addr>] [data]',
    );
    process.exit(1);
  }

  const [pemPath, receiver, value, nonceStr, chainID, dataStr] = positional;

  const pemContent = await fs.readFile(pemPath, 'utf8');
  const signer = UserSigner.fromPem(pemContent);
  const sender = signer.getAddress();

  // These constants must match the construction in the facilitator's
  // Settler.ts byte-for-byte; mismatches invalidate the signature.
  const gasLimit = relayer
    ? BASE_GAS_LIMIT + RELAYED_V3_EXTRA_GAS
    : BASE_GAS_LIMIT;

  const tx = new Transaction({
    nonce: BigInt(nonceStr),
    value: BigInt(value),
    receiver: new Address(receiver),
    sender: new Address(sender.bech32()),
    // Relayer field + version 2 are part of the signed payload; both must be
    // set before computeBytesForSigning, or the relayer will reject the tx.
    ...(relayer ? {relayer: new Address(relayer)} : {}),
    gasPrice: GAS_PRICE,
    gasLimit,
    data: dataStr ? Buffer.from(dataStr) : undefined,
    chainID: chainID,
    // version 2 keeps the payload compatible with Relayed V3 if a relayer
    // later wraps it.
    version: 2,
  });

  const computer = new TransactionComputer();
  const serialized = computer.computeBytesForSigning(tx);
  const signature = await signer.sign(serialized);
  tx.signature = signature;

  const payload: Record<string, unknown> = {
    sender: sender.bech32(),
    receiver: receiver,
    value: value,
    nonce: parseInt(nonceStr),
    data: dataStr,
    signature: signature.toString('hex'),
    chainID: chainID,
    version: 2,
    options: 0,
    gasPrice: Number(GAS_PRICE),
    gasLimit: Number(gasLimit),
    validBefore: Math.floor(Date.now() / 1000) + 3600,
  };
  if (relayer) {
    payload.relayer = relayer;
  }

  console.log(JSON.stringify(payload));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
