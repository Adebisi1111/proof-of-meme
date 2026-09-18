const { createClient, chains } = require('genlayer-js');
const { privateKeyToAccount } = require('viem/accounts');
const fs = require('fs');

const account = privateKeyToAccount('0x023d076ab40ea46c59ac7ca7cecfaa2db5fa10b7a481aef27cf68e9cc5a8c0af');
const client = createClient({ chain: chains.testnetBradbury, account });
const code = fs.readFileSync('contracts/proof_of_meme.py');

client.deployContract({
  code: new Uint8Array(code),
  args: [],
  value: 0n
}).then(hash => {
  console.log('Hash:', hash);
  return client.waitForTransactionReceipt({ hash });
}).then(receipt => {
  console.log('Address:', receipt.data?.contract_address);
}).catch(e => console.error(e.message));
