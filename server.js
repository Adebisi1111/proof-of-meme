const express = require('express');
const cors = require('cors');
const { createClient, chains } = require('genlayer-js');
const { privateKeyToAccount } = require('viem/accounts');

const app = express();
app.use(cors());
app.use(express.json());

const CONTRACT = process.env.CONTRACT_ADDRESS || '0x11d301222Fd7Fbb37E29344c62e1CB01e66AE1dA';
const PK = process.env.PRIVATE_KEY || '';

if (!PK) console.error('WARNING: PRIVATE_KEY not set!');
const account = PK ? privateKeyToAccount(PK) : null;
const client = account
  ? createClient({ chain: chains.testnetBradbury, account })
  : createClient({ chain: chains.testnetBradbury });

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', contract: CONTRACT, has_private_key: !!PK });
});

app.get('/healthz', (req, res) => res.send('ok'));

// Create bounty — funds come from backend wallet (escrow)
app.post('/api/create-bounty', async (req, res) => {
  try {
    const { project_token, description, min_engagement, value } = req.body;
    if (!project_token || !description || !value)
      return res.status(400).json({ detail: 'project_token, description, value required' });
    if (!PK) return res.status(500).json({ detail: 'PRIVATE_KEY not set on server' });

    const txHash = await client.writeContract({
      address: CONTRACT,
      functionName: 'create_bounty',
      args: [project_token, description, Number(min_engagement) || 500],
      value: BigInt(value),
    });

    const nextId = await client.readContract({ address: CONTRACT, function_name: 'next_id', args: [] });
    const bountyId = Number(nextId) - 1;

    res.json({ status: 'success', tx_hash: txHash, bounty_id: bountyId });
  } catch (err) {
    console.error('create-bounty error:', err);
    res.status(500).json({ detail: err.message });
  }
});

// Submit meme
app.post('/api/submit-meme', async (req, res) => {
  try {
    const { bounty_id, post_url } = req.body;
    if (bounty_id === undefined || bounty_id === null || !post_url)
      return res.status(400).json({ detail: 'bounty_id and post_url required' });
    if (!PK) return res.status(500).json({ detail: 'PRIVATE_KEY not set on server' });

    const txHash = await client.writeContract({
      address: CONTRACT,
      functionName: 'submit_meme',
      args: [Number(bounty_id), post_url],
      value: 0n,
    });

    // Poll for consensus result
    let result = null;
    for (let i = 0; i < 36; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const raw = await client.readContract({ address: CONTRACT, function_name: 'get_bounty', args: [Number(bounty_id)] });
        const parsed = JSON.parse(raw);
        if (parsed.submissions && parsed.submissions.length > 0) {
          result = parsed;
          break;
        }
      } catch (e) { /* not ready */ }
    }

    if (!result) {
      return res.status(202).json({ status: 'pending', tx_hash: txHash, message: 'Consensus in progress...' });
    }

    res.json({ status: 'success', bounty: result, tx_hash: txHash });
  } catch (err) {
    console.error('submit-meme error:', err);
    res.status(500).json({ detail: err.message });
  }
});

// Get single bounty
app.get('/api/bounty/:id', async (req, res) => {
  try {
    const raw = await client.readContract({ address: CONTRACT, function_name: 'get_bounty', args: [Number(req.params.id)] });
    res.json(JSON.parse(raw));
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// Get all bounties
app.get('/api/bounties', async (req, res) => {
  try {
    const raw = await client.readContract({ address: CONTRACT, function_name: 'get_all_bounties', args: [] });
    res.json(JSON.parse(raw));
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// Get next ID
app.get('/api/next-id', async (req, res) => {
  try {
    const id = await client.readContract({ address: CONTRACT, function_name: 'next_id', args: [] });
    res.json({ next_id: Number(id) });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Proof-of-Meme API on port ${PORT}`));
