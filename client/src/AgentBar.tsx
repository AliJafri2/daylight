import { Icon } from './ui';

// Top bar for an agent screen: back to the three agents.
export function AgentBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="topbar agent-bar">
      <button className="icon-btn" aria-label="Back to all agents" onClick={onBack}><Icon name="back" size={20} /></button>
      <h1>{title}</h1>
    </div>
  );
}
