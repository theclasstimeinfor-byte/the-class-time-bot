/**
 * The Class Time — WhatsApp AI Lead Follow-up Automation Server (Node.js + Express)
 * Connects to Meta WhatsApp Cloud API to send Interactive Reply Button messages,
 * receive webhook button clicks from leads, send instant auto-replies,
 * and run a 24-hour follow-up reminder scheduler.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cron = require('node-cron');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let apiCredentials = {
  whatsappToken: process.env.WHATSAPP_TOKEN || '',
  phoneNumberId: process.env.PHONE_NUMBER_ID || '',
  verifyToken: process.env.WEBHOOK_VERIFY_TOKEN || 'my_secret_verify_token_123',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@theclasstime.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123'
};

let botFlowConfig = {
  businessName: 'The Class Time',
  introMessage: 'Hi {{name}}! 👋 Welcome to The Class Time. Thanks for your inquiry! Please tap one of the main options below so we can assist you right away:',
  followupMessage: 'Hi {{name}}, this is a quick follow-up from The Class Time. Would you still like details about our classes and plans? Tap an option below:',
  options: [
    {
      id: 'opt_1',
      title: '1. Course & Fees',
      autoReply: 'Thank you for your interest in The Class Time! Our team is sharing the complete course & fee details with you right away.'
    },
    {
      id: 'opt_2',
      title: '2. Request Callback',
      autoReply: 'Great! A counselor from The Class Time will call you within the next 30 minutes. You can also reply with your preferred time.'
    },
    {
      id: 'opt_3',
      title: '3. Not Interested',
      autoReply: 'No problem at all! Thank you for your time. Feel free to reach out anytime in the future if you need help.'
    }
  ]
};

let leads = [
  {
    id: 'L101',
    name: 'Rahul Sharma',
    phone: '919826011223',
    source: 'Facebook Ad',
    status: 'Pending',
    selectedOption: '-',
    lastContacted: null
  },
  {
    id: 'L102',
    name: 'Priya Verma',
    phone: '919811223344',
    source: 'Instagram Lead',
    status: 'Sent',
    selectedOption: '-',
    lastContacted: new Date(Date.now() - 25 * 3600 * 1000).toISOString()
  },
  {
    id: 'L103',
    name: 'Vikram Gupta',
    phone: '919988776655',
    source: 'Website Form',
    status: 'Replied',
    selectedOption: '1. Course & Fees',
    lastContacted: new Date().toISOString()
  }
];

// 1. Send WhatsApp Interactive Reply Button Message
async function sendInteractiveButtons(toPhone, leadName, isFollowup = false) {
  const bodyText = (isFollowup ? botFlowConfig.followupMessage : botFlowConfig.introMessage)
    .replace(/\{\{name\}\}/g, leadName || 'Student');

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toPhone.replace(/[^0-9]/g, ''),
    type: 'interactive',
    interactive: {
      type: 'button',
      header: {
        type: 'text',
        text: botFlowConfig.businessName
      },
      body: {
        text: bodyText
      },
      footer: {
        text: 'Tap an option below to reply 👇'
      },
      action: {
        buttons: botFlowConfig.options.slice(0, 3).map(opt => ({
          type: 'reply',
          reply: {
            id: opt.id,
            title: opt.title.substring(0, 20)
          }
        }))
      }
    }
  };

  if (!apiCredentials.whatsappToken || !apiCredentials.phoneNumberId) {
    console.log('[SIMULATION MODE] WhatsApp Payload ready for', toPhone);
    return { simulated: true, payload };
  }

  const url = `https://graph.facebook.com/v20.0/${apiCredentials.phoneNumberId}/messages`;
  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${apiCredentials.whatsappToken}`,
      'Content-Type': 'application/json'
    }
  });
  return response.data;
}

// 2. Send Automatic Text Reply when Customer Taps a Button
async function sendTextMessage(toPhone, text) {
  const payload = {
    messaging_product: 'whatsapp',
    to: toPhone.replace(/[^0-9]/g, ''),
    type: 'text',
    text: { body: text }
  };

  if (!apiCredentials.whatsappToken || !apiCredentials.phoneNumberId) {
    console.log('[SIMULATION MODE] Auto-reply sent to', toPhone, ':', text);
    return { simulated: true };
  }

  const url = `https://graph.facebook.com/v20.0/${apiCredentials.phoneNumberId}/messages`;
  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${apiCredentials.whatsappToken}`,
      'Content-Type': 'application/json'
    }
  });
  return response.data;
}

// 3. Admin Login & Dashboard API Endpoints
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (email === apiCredentials.adminEmail && password === apiCredentials.adminPassword) {
    return res.json({ success: true, email });
  }
  return res.status(401).json({ success: false, error: 'Invalid email or password' });
});

app.get('/api/state', (req, res) => {
  res.json({
    leads,
    botFlowConfig,
    apiConnected: Boolean(apiCredentials.whatsappToken && apiCredentials.phoneNumberId),
    phoneNumberId: apiCredentials.phoneNumberId,
    verifyToken: apiCredentials.verifyToken
  });
});

app.post('/api/config', (req, res) => {
  botFlowConfig = { ...botFlowConfig, ...req.body };
  res.json({ success: true, botFlowConfig });
});

app.post('/api/credentials', (req, res) => {
  const { whatsappToken, phoneNumberId, verifyToken } = req.body;
  if (whatsappToken !== undefined) apiCredentials.whatsappToken = whatsappToken.trim();
  if (phoneNumberId !== undefined) apiCredentials.phoneNumberId = phoneNumberId.trim();
  if (verifyToken !== undefined) apiCredentials.verifyToken = verifyToken.trim();
  res.json({
    success: true,
    apiConnected: Boolean(apiCredentials.whatsappToken && apiCredentials.phoneNumberId)
  });
});

app.post('/api/leads', (req, res) => {
  const { name, phone, source } = req.body;
  const newLead = {
    id: 'L' + Math.floor(1000 + Math.random() * 9000),
    name,
    phone,
    source: source || 'Manual',
    status: 'Pending',
    selectedOption: '-',
    lastContacted: null
  };
  leads.unshift(newLead);
  res.json({ success: true, lead: newLead });
});

app.post('/api/send-followup', async (req, res) => {
  try {
    const { leadId, isReminder } = req.body;
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const result = await sendInteractiveButtons(lead.phone, lead.name, isReminder);
    lead.status = isReminder ? 'Reminder Sent' : 'Sent';
    lead.lastContacted = new Date().toISOString();
    res.json({ success: true, lead, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Meta WhatsApp Webhook Verification (GET)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === apiCredentials.verifyToken) {
    console.log('Webhook Verified Successfully!');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 5. Meta WhatsApp Incoming Button Reply Webhook (POST)
app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (message) {
      const fromPhone = message.from;
      let selectedId = null;
      let selectedTitle = null;

      if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
        selectedId = message.interactive.button_reply.id;
        selectedTitle = message.interactive.button_reply.title;
      } else if (message.type === 'button') {
        selectedTitle = message.button.text;
      }

      if (selectedId || selectedTitle) {
        const matchedOption = botFlowConfig.options.find(
          o => o.id === selectedId || o.title === selectedTitle
        );

        const lead = leads.find(l => l.phone.replace(/[^0-9]/g, '').endsWith(fromPhone.slice(-10)));
        if (lead) {
          lead.status = 'Replied';
          lead.selectedOption = selectedTitle || selectedId;
        }

        if (matchedOption) {
          await sendTextMessage(fromPhone, matchedOption.autoReply);
        }
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook Error:', error.message);
    res.sendStatus(500);
  }
});

// 6. Automatic 24-Hour Follow-up Scheduler
cron.schedule('0 * * * *', async () => {
  const now = Date.now();
  for (const lead of leads) {
    if (lead.status === 'Sent' && lead.lastContacted) {
      const hoursPassed = (now - new Date(lead.lastContacted).getTime()) / (1000 * 3600);
      if (hoursPassed >= 24) {
        await sendInteractiveButtons(lead.phone, lead.name, true);
        lead.status = 'Reminder Sent';
        lead.lastContacted = new Date().toISOString();
      }
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`The Class Time WhatsApp Server running on http://localhost:${PORT}`);
});
