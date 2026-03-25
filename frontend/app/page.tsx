'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import ReactFlow, { Background, Controls, Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import { useMemo } from 'react';

export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const [query, setQuery] = useState<string>('');
  const [answer, setAnswer] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeDetails, setNodeDetails] = useState<any>(null);

  const nodeTypes = useMemo(() => ({}), []);
  const edgeTypes = useMemo(() => ({}), []);

  useEffect(() => {
    const loadGraph = async () => {
      try {
        const res = await axios.get('http://localhost:5000/graph');
        setNodes(res.data.nodes || []);
        setEdges(res.data.edges || []);
      } catch (err) {
        console.error('Graph Error:', err);
      }
    };

    loadGraph();
  }, []);

  const handleNodeClick = async (event: any, node: Node) => {
    setSelectedNode(node);

    const id = node.id.split('_')[1];
    const type = node.id.split('_')[0];

    try {
      const res = await axios.get(`http://localhost:5000/trace/${id}`);

      setNodeDetails({
        ...res.data,
        type,
        id,
      });
    } catch (err) {
      console.error('Node fetch error:', err);
      setNodeDetails(null);
    }
  };

  const highlightNodes = (text: string) => {
    const id = text.match(/\d+/)?.[0];
    if (!id) return;

    setNodes((prev) =>
      prev.map((node) =>
        node.id.includes(id)
          ? {
              ...node,
              style: {
                background: 'yellow',
                border: '2px solid red',
              },
            }
          : {
              ...node,
              style: {},
            },
      ),
    );
  };

  const sendQuery = async () => {
    if (!query.trim()) return;

    try {
      setLoading(true);

      const res = await axios.post('http://localhost:5000/chat', {
        query,
      });

      if (res.data.error) {
        setAnswer(`${res.data.error}`);
      } else {
        setAnswer(
          `SQL:\n${res.data.sql}\n\n Data:\n${JSON.stringify(
            res.data.data,
            null,
            2,
          )}\n\n ${res.data.answer || ''}`,
        );

        highlightNodes(query);
      }

      setQuery('');
    } catch (err) {
      console.error(err);
      setAnswer(' Server error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* ===== GRAPH ===== */}
      <div style={{ width: '70%', height: '100%', position: 'relative' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          onNodeClick={handleNodeClick}
        >
          <Background />
          <Controls />
        </ReactFlow>

        {selectedNode && (
          <div
            style={{
              position: 'absolute',
              top: 20,
              left: 20,
              background: '#fff',
              padding: '15px',
              borderRadius: '10px',
              boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
              width: '280px',
              zIndex: 10,
            }}
          >
            <h3> Node Details</h3>

            <p>
              <b>ID:</b> {selectedNode.id}
            </p>
            <p>
              <b>Label:</b> {selectedNode.data?.label}
            </p>

            {nodeDetails && (
              <>
                <hr />

                <h4> Order</h4>
                <p>ID: {nodeDetails.order?.salesOrder || 'N/A'}</p>
                <p>Amount: {nodeDetails.order?.totalNetAmount || 'N/A'}</p>

                <h4> Delivery</h4>
                <p>{nodeDetails.delivery?.deliverydocument || 'Not linked'}</p>

                <h4>Payment</h4>
                <p>
                  {nodeDetails.payment?.accountingdocument || 'Not available'}
                </p>
              </>
            )}

            <button
              onClick={() => {
                setSelectedNode(null);
                setNodeDetails(null);
              }}
              style={{
                marginTop: '10px',
                padding: '6px 12px',
                background: 'red',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>

      <div
        style={{
          width: '30%',
          padding: '20px',
          borderLeft: '1px solid #ccc',
          background: '#f9f9f9',
        }}
      >
        <h2> Chat with Data</h2>

        <input
          type="text"
          placeholder="Ask about orders, deliveries..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '10px',
            marginBottom: '10px',
            borderRadius: '6px',
            border: '1px solid #ccc',
          }}
        />

        <button
          onClick={sendQuery}
          disabled={loading}
          style={{
            padding: '10px',
            width: '100%',
            background: '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          {loading ? 'Loading...' : 'Send'}
        </button>

        <pre
          style={{
            marginTop: '20px',
            whiteSpace: 'pre-wrap',
            background: '#fff',
            padding: '10px',
            borderRadius: '6px',
            height: '60%',
            overflowY: 'auto',
            border: '1px solid #ddd',
          }}
        >
          {answer}
        </pre>
      </div>
    </div>
  );
}
