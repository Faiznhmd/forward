require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const Groq = require('groq-sdk');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

app.get('/graph', async (req, res) => {
  try {
    const orders = await pool.query(
      `SELECT "salesOrder" FROM sales_order_headers LIMIT 50`,
    );
    const deliveries = await pool.query(
      `SELECT deliverydocument, salesorder FROM outbound_delivery_headers LIMIT 50`,
    );
    const invoices = await pool.query(
      `SELECT billingdocument FROM billing_document_headers LIMIT 50`,
    );
    const payments = await pool.query(
      `SELECT accountingdocument, referencedocument FROM journal_entry_items_accounts_receivable LIMIT 50`,
    );

    let nodes = [];
    let edges = [];

    orders.rows.forEach((o, i) => {
      nodes.push({
        id: 'order_' + o.salesOrder,
        data: { label: 'Order ' + o.salesOrder },
        position: { x: i * 150, y: 100 },
      });
    });

    deliveries.rows.forEach((d, i) => {
      nodes.push({
        id: 'delivery_' + d.deliverydocument,
        data: { label: 'Delivery ' + d.deliverydocument },
        position: { x: i * 150, y: 220 },
      });

      if (d.salesorder) {
        edges.push({
          id: 'od_' + i,
          source: 'order_' + d.salesorder,
          target: 'delivery_' + d.deliverydocument,
        });
      }
    });

    invoices.rows.forEach((inv, i) => {
      nodes.push({
        id: 'invoice_' + inv.billingdocument,
        data: { label: 'Invoice ' + inv.billingdocument },
        position: { x: i * 150, y: 340 },
      });
    });

    payments.rows.forEach((p, i) => {
      nodes.push({
        id: 'payment_' + p.accountingdocument,
        data: { label: 'Payment ' + p.accountingdocument },
        position: { x: i * 150, y: 460 },
      });

      if (p.referencedocument) {
        edges.push({
          id: 'ip_' + i,
          source: 'invoice_' + p.referencedocument,
          target: 'payment_' + p.accountingdocument,
        });
      }
    });

    res.json({ nodes, edges });
  } catch (err) {
    console.error('Graph Error:', err);
    res.status(500).json({ error: 'Graph error' });
  }
});

app.get('/trace/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT 
        so."salesOrder" AS salesorder,
        so.totalnetamount,

        d.deliverydocument,

        i.billingdocument,

        p.accountingdocument

      FROM sales_order_headers so

      LEFT JOIN outbound_delivery_headers d 
        ON d.salesorder = so."salesOrder"

      LEFT JOIN billing_document_headers i 
        ON i.referencedocument = d.deliverydocument

      LEFT JOIN journal_entry_items_accounts_receivable p 
        ON p.referencedocument = i.billingdocument

      WHERE 
        so."salesOrder" = $1
        OR d.deliverydocument = $1
        OR i.billingdocument = $1
        OR p.accountingdocument = $1

      LIMIT 1
      `,
      [id],
    );

    if (result.rows.length === 0) {
      return res.json({
        order: null,
        delivery: null,
        invoice: null,
        payment: null,
      });
    }

    const row = result.rows[0];

    res.json({
      order: row.salesorder
        ? {
            salesorder: row.salesorder,
            totalnetamount: row.totalnetamount,
          }
        : null,

      delivery: row.deliverydocument
        ? {
            deliverydocument: row.deliverydocument,
          }
        : null,

      invoice: row.billingdocument
        ? {
            billingdocument: row.billingdocument,
          }
        : null,

      payment: row.accountingdocument
        ? {
            accountingdocument: row.accountingdocument,
          }
        : null,
    });
  } catch (err) {
    console.error('Trace Error:', err);
    res.status(500).json({ error: 'Trace failed' });
  }
});

app.post('/chat', async (req, res) => {
  const { query } = req.body;

  try {
    const q = query.toLowerCase();
    let sql = '';

    if (q.includes('order')) {
      sql = `
        SELECT 
          "salesOrder",
          "totalNetAmount"
        FROM sales_order_headers
        LIMIT 5
      `;
    } else if (q.includes('deliver')) {
      sql = `
        SELECT 
          d.deliverydocument,
          d.salesorder
        FROM outbound_delivery_headers d
        LIMIT 5
      `;
    } else if (q.includes('invoice')) {
      sql = `
    SELECT 
      billingdocument,
      accountingdocument,
      totalnetamount
    FROM billing_document_headers
    LIMIT 5
  `;
    } else if (q.includes('payment')) {
      sql = `
        SELECT 
          p.accountingdocument,
          p.referencedocument
        FROM journal_entry_items_accounts_receivable p
        LIMIT 5
      `;
    } else if (
      q.includes('flow') ||
      q.includes('full') ||
      q.includes('chain')
    ) {
      sql = `
    SELECT 
      so."salesOrder",
      so."totalNetAmount",
      d.deliverydocument,
      i.billingdocument,
      p.accountingdocument

    FROM sales_order_headers so

    LEFT JOIN outbound_delivery_headers d 
      ON d.salesorder = so."salesOrder"

    LEFT JOIN billing_document_headers i 
      ON TRUE   -- no direct join (safe)

    LEFT JOIN journal_entry_items_accounts_receivable p 
      ON p.accountingdocument = i.accountingdocument

    LIMIT 5
  `;
    } else {
      return res.json({
        error: 'Only order/delivery/invoice/payment queries allowed',
        sql: null,
      });
    }

    console.log('Final SQL:', sql);

    const result = await pool.query(sql);

    res.json({
      sql,
      data: result.rows,
      answer: `Found ${result.rows.length} results`,
    });
  } catch (err) {
    console.error('Chat Error:', err);
    res.json({
      error: 'Server error',
      sql: null,
    });
  }
});

app.listen(5000, () => {
  console.log('Server running on port 5000 ');
});
