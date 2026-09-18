const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
// Frontend served from GitHub Pages

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '0xD1232B0611893733C7cbb59E4a44541Ae578FBD2';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const RPC_URL = process.env.RPC_URL || 'https://rpc-bradbury.genlayer.com';

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    contract: CONTRACT_ADDRESS,
    network: 'GenLayer Bradbury',
    has_private_key: !!PRIVATE_KEY
  });
});

app.get('/healthz', (req, res) => {
  res.send('ok');
});

// Create bounty
app.post('/api/create-bounty', async (req, res) => {
  try {
    const { project_token, description, min_engagement, value } = req.body;
    if (!project_token || !description || !value) {
      return res.status(400).json({ detail: 'project_token, description, and value required' });
    }
    if (!PRIVATE_KEY) {
      return res.status(500).json({ detail: 'PRIVATE_KEY not set' });
    }

    const { createClient, chains } = require('genlayer-js');
    const { privateKeyToAccount } = require('viem/accounts');

    const account = privateKeyToAccount(PRIVATE_KEY);
    const client = createClient({ chain: chains.testnetBradbury, account });

    const txHash = await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: 'create_bounty',
      args: [project_token, description, min_engagement || 500],
      value: BigInt(value),
    });

    res.json({
      status: 'success',
      tx_hash: txHash,
      message: 'Bounty created. Waiting for GenLayer consensus...'
    });
  } catch (err) {
    console.error('Create bounty error:', err);
    res.status(500).json({ detail: err.message });
  }
});

// Submit meme
app.post('/api/submit-meme', async (req, res) => {
  try {
    const { bounty_id, post_url } = req.body;
    if (!bounty_id && bounty_id !== 0 || !post_url) {
      return res.status(400).json({ detail: 'bounty_id and post_url required' });
    }
    if (!PRIVATE_KEY) {
      return res.status(500).json({ detail: 'PRIVATE_KEY not set' });
    }

    const { createClient, chains } = require('genlayer-js');
    const { privateKeyToAccount } = require('viem/accounts');

    const account = privateKeyToAccount(PRIVATE_KEY);
    const client = createClient({ chain: chains.testnetBradbury, account });

    const txHash = await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: 'submit_meme',
      args: [bounty_id, post_url],
      value: 0n,
    });

    // Poll for result - consensus takes 2-3 minutes
    let attempts = 0;
    const maxAttempts = 30;
    let result = null;

    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 10000));
      attempts++;

      try {
        const bounty = await client.readContract({
          address: CONTRACT_ADDRESS,
          functionName: 'get_bounty',
          args: [bounty_id],
        });
        const parsed = JSON.parse(bounty);
        if (parsed.status === 'COMPLETED' || parsed.submissions?.length > 0) {
          result = parsed;
          break;
        }
      } catch (e) {
        // Not ready yet
      }
    }

    if (!result) {
      return res.status(202).json({
        status: 'pending',
        tx_hash: txHash,
        message: 'Submission is being verified by GenLayer AI consensus. Check back in 2-3 minutes.'
      });
    }

    res.json({
      status: 'success',
      bounty: result,
      tx_hash: txHash
    });
  } catch (err) {
    console.error('Submit meme error:', err);
    res.status(500).json({ detail: err.message });
  }
});

// Get bounty
app.get('/api/bounty/:id', async (req, res) => {
  try {
    const { createClient, chains } = require('genlayer-js');
    const client = createClient({ chain: chains.testnetBradbury });
    const bounty = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_bounty',
      args: [parseInt(req.params.id)],
    });
    res.json(JSON.parse(bounty));
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// Get next ID
app.get('/api/next-id', async (req, res) => {
  try {
    const { createClient, chains } = require('genlayer-js');
    const client = createClient({ chain: chains.testnetBradbury });
    const id = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'next_id',
      args: [],
    });
    res.json({ next_id: parseInt(id) });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.get('/', (req, res) => {
  
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Proof-of-Meme server running on port ${PORT}`);
});
