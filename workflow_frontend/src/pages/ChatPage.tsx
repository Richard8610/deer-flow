import { Link } from 'react-router-dom';
import { APP } from '../workflow.config';
import { FloatingChat } from '../components/FloatingChat';

export function ChatPage() {
  return (
    <div className="chat-page">
      <header className="topbar">
        <Link to="/" className="topbar__back">← Builder</Link>
        <span className="topbar__title">{APP.title} — AI Assistant</span>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', maxWidth: '860px', width: '100%', margin: '0 auto' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#F1F5F9', marginBottom: '8px' }}>
          AI Chat Assistant
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '32px' }}>
          Use the chat widget in the bottom-right corner to interact with the AI assistant.
          Select a skill and tools, upload documents, and send messages to get started.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          {[
            { icon: '🗺️', title: 'Plan your workflow', desc: 'Describe the process you want to automate and the assistant will help you map out the steps.' },
            { icon: '🔍', title: 'Research & analysis', desc: 'Ask the assistant to gather information, compare options, or summarise documents you upload.' },
            { icon: '🛠️', title: 'Select the right tools', desc: 'Toggle Calculator, Web Search, or Image Generator to extend what the assistant can do.' },
            { icon: '📄', title: 'Upload context docs', desc: 'Drag-and-drop a PDF, Markdown, or Word file to give the assistant extra context for your task.' },
            { icon: '⚡', title: 'Pick a skill', desc: 'Skills are pre-built prompt templates that prime the assistant for a specific domain or task type.' },
            { icon: '↙', title: 'Open in Builder', desc: 'When the assistant outputs a workflow definition you can open it directly in the visual Builder.' },
          ].map((card) => (
            <div
              key={card.title}
              style={{
                background: '#1E293B', border: '1px solid #334155', borderRadius: '12px',
                padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px',
              }}
            >
              <span style={{ fontSize: '28px' }}>{card.icon}</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#E2E8F0' }}>{card.title}</span>
              <span style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.5 }}>{card.desc}</span>
            </div>
          ))}
        </div>

        <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: '12px', padding: '20px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9', marginBottom: '12px' }}>Workflow tips</h2>
          <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              'Be specific about inputs and outputs when describing a workflow step.',
              'Upload a reference document to give the assistant extra context.',
              'Use the skill selector to load a domain-specific prompt template.',
              'Enable Web Search when you need up-to-date information.',
              'Press Shift+Enter in the chat input to add a new line without sending.',
            ].map((tip) => (
              <li key={tip} style={{ fontSize: '13px', color: '#94A3B8', lineHeight: 1.5 }}>{tip}</li>
            ))}
          </ul>
        </div>
      </div>

      <FloatingChat />
    </div>
  );
}
