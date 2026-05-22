import { Link } from 'react-router-dom';
import { APP } from '../workflow.config';
import { FloatingChat } from '../components/FloatingChat';

const CARDS = [
  { icon: '🗺️', title: 'Plan your workflow', desc: 'Describe the process you want to automate and the assistant will help you map out the steps.' },
  { icon: '🔍', title: 'Research & analysis', desc: 'Ask the assistant to gather information, compare options, or summarise documents you upload.' },
  { icon: '🛠️', title: 'Select the right tools', desc: 'Toggle Calculator, Web Search, or Image Generator to extend what the assistant can do.' },
  { icon: '📄', title: 'Upload context docs', desc: 'Drag-and-drop a PDF, Markdown, or Word file to give the assistant extra context for your task.' },
  { icon: '⚡', title: 'Pick a skill', desc: 'Skills are pre-built prompt templates that prime the assistant for a specific domain or task type.' },
  { icon: '↙', title: 'Open in Builder', desc: 'When the assistant outputs a workflow definition you can open it directly in the visual Builder.' },
];

const TIPS = [
  'Be specific about inputs and outputs when describing a workflow step.',
  'Upload a reference document to give the assistant extra context.',
  'Use the skill selector to load a domain-specific prompt template.',
  'Enable Web Search when you need up-to-date information.',
  'Press Shift+Enter in the chat input to add a new line without sending.',
];

export function ChatPage() {
  return (
    <div className="chat-page">
      <header className="topbar">
        <Link to="/" className="topbar__back">← Builder</Link>
        <span className="topbar__title">{APP.title} — AI Assistant</span>
      </header>

      <div className="chat-page__body">
        {/* Left: content */}
        <div className="chat-page__content">
          <h1 className="chat-page__heading">AI Chat Assistant</h1>
          <p className="chat-page__sub">Select a skill and tools, upload a document, and describe what you need.</p>

          <div className="chat-page__cards">
            {CARDS.map((c) => (
              <div key={c.title} className="chat-page__card">
                <span className="chat-page__card-icon">{c.icon}</span>
                <span className="chat-page__card-title">{c.title}</span>
                <span className="chat-page__card-desc">{c.desc}</span>
              </div>
            ))}
          </div>

          <div className="chat-page__tips">
            <h2 className="chat-page__tips-title">Tips</h2>
            <ul className="chat-page__tips-list">
              {TIPS.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </div>
        </div>

        {/* Right: chat */}
        <div className="chat-page__chat">
          <FloatingChat />
        </div>
      </div>
    </div>
  );
}
