import React from 'react';
import GateShell from './GateShell.jsx';
import { Button, Input, Field } from '../ui.jsx';

export default function GateStep1Name({ summary, initialName = '', onNext }) {
  const [name, setName] = React.useState(initialName);
  const trimmed = name.trim();
  const submit = (e) => { e.preventDefault(); if (trimmed) onNext(trimmed); };
  return (
    <GateShell
      step={1}
      summary={summary}
      title="Unlock the full deal"
      subtitle="Quick verify so wholesalers know you're a real buyer. Takes 30 seconds."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Your first name">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Marcus"
            maxLength={100}
          />
        </Field>
        <Button type="submit" disabled={!trimmed} className="w-full justify-center">Next</Button>
      </form>
    </GateShell>
  );
}
