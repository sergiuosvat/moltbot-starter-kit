'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', {enumerable: true, value: v});
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, '__esModule', {value: true});
const sdk_core_1 = require('@multiversx/sdk-core');
const sdk_network_providers_1 = require('@multiversx/sdk-network-providers');
const config_1 = require('./config');
const facilitator_1 = require('./facilitator');
const fs = __importStar(require('fs'));
const path = __importStar(require('path'));
async function runEmployerFlow() {
  console.log('--- Starting Employer Hiring Flow ---');
  if (!config_1.CONFIG.EMPLOYER.PEM_PATH || !config_1.CONFIG.EMPLOYER.ADDRESS) {
    console.error('Employer PEM_PATH or ADDRESS not configured in .env');
    process.exit(1);
  }
  const facilitator = new facilitator_1.Facilitator();
  const pemContent = fs
    .readFileSync(config_1.CONFIG.EMPLOYER.PEM_PATH)
    .toString();
  const signer = sdk_core_1.UserSigner.fromPem(pemContent);
  const employerAddr = config_1.CONFIG.EMPLOYER.ADDRESS;
  // 1. Prepare Job (Architect Phase)
  // Requesting an 'inference' service for agent nonce 1
  const agentNonce = 1;
  const serviceId = 'inference';
  console.log(
    `Preparing job for Agent ${agentNonce}, service: ${serviceId}...`,
  );
  const preparation = await facilitator.prepare({
    agentNonce,
    serviceId,
    employerAddress: employerAddr,
  });
  console.log('Preparation received:', {
    jobId: preparation.jobId,
    amount: preparation.amount,
    receiver: preparation.receiver,
  });
  // Setup Provider
  const provider = new sdk_network_providers_1.ApiNetworkProvider(
    config_1.CONFIG.API_URL,
  );
  const performSettlement = async attempt => {
    try {
      console.log(`\n--- Settlement Attempt ${attempt} ---`);
      // 1. Fetch Fresh Nonce
      const account = await provider.getAccount({bech32: () => employerAddr});
      console.log(`Fetched Sender Nonce: ${account.nonce}`);
      // 2. Construct Transaction
      const tx = new sdk_core_1.Transaction({
        nonce: BigInt(account.nonce),
        value: BigInt(preparation.amount),
        receiver: sdk_core_1.Address.newFromBech32(preparation.registryAddress),
        sender: sdk_core_1.Address.newFromBech32(employerAddr),
        gasPrice: 1000000000n,
        gasLimit: 30000000n,
        data: Buffer.from(preparation.data),
        chainID: config_1.CONFIG.CHAIN_ID,
      });
      const computer = new sdk_core_1.TransactionComputer();
      const bytesToSign = computer.computeBytesForSigning(tx);
      const signature = await signer.sign(bytesToSign);
      // 3. Settle Job
      console.log('Sending signed transaction to Facilitator...');
      const settlementPayload = {
        nonce: Number(tx.nonce),
        value: tx.value.toString(),
        receiver: tx.receiver.toBech32(),
        sender: tx.sender.toBech32(),
        gasPrice: Number(tx.gasPrice),
        gasLimit: Number(tx.gasLimit),
        data: preparation.data,
        chainID: tx.chainID,
        version: tx.version,
        options: tx.options,
        signature: Buffer.from(signature).toString('hex'),
      };
      const result = await facilitator.settle(settlementPayload);
      console.log(`Settlement Broadcasted. TxHash: ${result.txHash}`);
      // 4. Monitor Protocol
      return await monitorTx(result.txHash);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Attempt ${attempt} failed: ${message}`);
    }
  };
  const monitorTx = async txHash => {
    const maxTime = 120000; // 2 mins
    const start = Date.now();
    while (Date.now() - start < maxTime) {
      try {
        const tx = await provider.getTransaction(txHash);
        const status = tx.status.toString().toLowerCase(); // sdk-core v13+ might return object
        console.log(`Monitoring ${txHash}: ${status}`);
        if (status === 'success' || status === 'successful') return txHash;
        if (status === 'fail' || status === 'failed' || status === 'invalid')
          throw new Error(`Tx failed on-chain: ${status}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('404')) {
          // pending propagation
        } else {
          console.warn(`Monitor error: ${message}`);
        }
      }
      await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error('Transaction monitoring timed out after 2 minutes.');
  };
  // Retry Loop
  let attempts = 1;
  let settledJobId;
  while (attempts <= 3) {
    try {
      const finalHash = await performSettlement(attempts);
      console.log('\nSUCCESS: Job Initialized and Confirmed!');
      console.log(`TxHash: ${finalHash}`);
      console.log(`JobId: ${preparation.jobId}`);
      settledJobId = preparation.jobId;
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(message);
      console.warn('Retrying in 5s...');
      await new Promise(r => setTimeout(r, 5000));
      attempts++;
    }
  }
  if (!settledJobId) {
    console.error('Failed to settle job after 3 attempts.');
    process.exit(1);
  }
  // 5. Wait for Verification (Worker to submit proof)
  console.log('\n--- Waiting for Job Verification ---');
  await waitForJobVerification(settledJobId, provider);
  // 6. Submit Reputation
  console.log('\n--- Submitting Reputation Feedback ---');
  await submitReputation(settledJobId, 5, provider, signer, employerAddr); // Rating 5/5
}
async function waitForJobVerification(jobId, provider) {
  const registry = sdk_core_1.Address.newFromBech32(
    config_1.CONFIG.ADDRESSES.VALIDATION_REGISTRY,
  );
  const maxRetries = 60; // Wait up to 5 minutes (5s * 60)
  const abiPath = path.join(
    __dirname,
    '../src/abis/validation-registry.abi.json',
  );
  const entrypoint = new sdk_core_1.DevnetEntrypoint({
    url: config_1.CONFIG.API_URL,
  });
  const abi = sdk_core_1.Abi.create(
    JSON.parse(fs.readFileSync(abiPath, 'utf8')),
  );
  const controller = entrypoint.createSmartContractController(abi);
  for (let i = 0; i < maxRetries; i++) {
    process.stdout.write('.');
    try {
      const results = await controller.query({
        contract: registry,
        function: 'is_job_verified',
        arguments: [Buffer.from(jobId)],
      });
      if (results[0] === true) {
        console.log('\nJob Verification Confirmed!');
        return;
      }
    } catch (e) {
      // Ignore temporary query failures
      console.warn('Query failed:', e.message);
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(
    '\nJob verification timed out. Worker did not submit proof in time.',
  );
}
async function submitReputation(jobId, rating, provider, signer, sender) {
  const agentNonce = 1;
  const registry = sdk_core_1.Address.newFromBech32(
    config_1.CONFIG.ADDRESSES.REPUTATION_REGISTRY,
  );
  const senderAddr = sdk_core_1.Address.newFromBech32(sender);
  const abiPath = path.join(
    __dirname,
    '../src/abis/reputation-registry.abi.json',
  );
  const abi = sdk_core_1.Abi.create(
    JSON.parse(fs.readFileSync(abiPath, 'utf8')),
  );
  const account = await provider.getAccount({bech32: () => sender});
  const entrypoint = new sdk_core_1.DevnetEntrypoint({
    url: config_1.CONFIG.API_URL,
  });
  const factory = entrypoint.createSmartContractTransactionsFactory(abi);
  const tx = await factory.createTransactionForExecute(senderAddr, {
    contract: registry,
    function: 'submit_feedback',
    arguments: [Buffer.from(jobId), BigInt(agentNonce), BigInt(rating)],
    gasLimit: 10000000n,
  });
  tx.nonce = BigInt(account.nonce);
  const computer = new sdk_core_1.TransactionComputer();
  tx.signature = await signer.sign(computer.computeBytesForSigning(tx));
  console.log('Broadcasting feedback tx...');
  const txHash = await provider.sendTransaction(tx);
  console.log(`Feedback Tx: ${txHash}`);
}
if (require.main === module) {
  runEmployerFlow().catch(err => {
    console.error('Hiring flow failed:', err.message);
    process.exit(1);
  });
}
//# sourceMappingURL=hiring.js.map
